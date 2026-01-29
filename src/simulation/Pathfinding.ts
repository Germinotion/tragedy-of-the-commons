export interface PathNode {
  x: number;
  y: number;
  g: number; // Cost from start
  h: number; // Heuristic to goal
  f: number; // Total cost (g + h)
  parent: PathNode | null;
}

export type CostFunction = (x: number, y: number) => number;

/**
 * A* pathfinding implementation with weighted cost grid.
 */
export class Pathfinder {
  private width: number;
  private height: number;
  private getCost: CostFunction;

  constructor(width: number, height: number, getCost: CostFunction) {
    this.width = width;
    this.height = height;
    this.getCost = getCost;
  }

  /**
   * Find path from start to goal using A*.
   *
   * @param sx - Start X
   * @param sy - Start Y
   * @param gx - Goal X
   * @param gy - Goal Y
   * @returns Array of [x, y] positions or empty if no path
   */
  findPath(sx: number, sy: number, gx: number, gy: number): [number, number][] {
    sx = Math.floor(sx);
    sy = Math.floor(sy);
    gx = Math.floor(gx);
    gy = Math.floor(gy);

    if (sx === gx && sy === gy) return [[sx, sy]];
    if (!this.isValid(sx, sy) || !this.isValid(gx, gy)) return [];

    const openSet: PathNode[] = [];
    const closedSet = new Set<string>();

    const startNode: PathNode = {
      x: sx,
      y: sy,
      g: 0,
      h: this.heuristic(sx, sy, gx, gy),
      f: 0,
      parent: null,
    };
    startNode.f = startNode.g + startNode.h;
    openSet.push(startNode);

    const maxIterations = this.width * this.height;
    let iterations = 0;

    while (openSet.length > 0 && iterations++ < maxIterations) {
      // Get node with lowest f score
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;
      const currentKey = `${current.x},${current.y}`;

      if (closedSet.has(currentKey)) continue;
      closedSet.add(currentKey);

      // Check if we reached goal
      if (current.x === gx && current.y === gy) {
        return this.reconstructPath(current);
      }

      // Explore neighbors (8-directional)
      for (const [dx, dy] of [
        [0, -1], [0, 1], [-1, 0], [1, 0],
        [-1, -1], [-1, 1], [1, -1], [1, 1],
      ]) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const neighborKey = `${nx},${ny}`;

        if (!this.isValid(nx, ny) || closedSet.has(neighborKey)) continue;

        // Diagonal movement cost slightly higher
        const moveCost = dx !== 0 && dy !== 0 ? 1.414 : 1;
        const terrainCost = this.getCost(nx, ny);
        const g = current.g + moveCost * terrainCost;
        const h = this.heuristic(nx, ny, gx, gy);

        const existingIdx = openSet.findIndex((n) => n.x === nx && n.y === ny);

        if (existingIdx === -1) {
          openSet.push({
            x: nx,
            y: ny,
            g,
            h,
            f: g + h,
            parent: current,
          });
        } else if (g < openSet[existingIdx].g) {
          openSet[existingIdx].g = g;
          openSet[existingIdx].f = g + h;
          openSet[existingIdx].parent = current;
        }
      }
    }

    return []; // No path found
  }

  private isValid(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  private heuristic(x1: number, y1: number, x2: number, y2: number): number {
    // Euclidean distance
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  private reconstructPath(node: PathNode): [number, number][] {
    const path: [number, number][] = [];
    let current: PathNode | null = node;

    while (current) {
      path.unshift([current.x, current.y]);
      current = current.parent;
    }

    return path;
  }
}

/**
 * Simple straight-line path with noise (for less deterministic movement).
 */
export function straightPath(
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  steps: number = 10
): [number, number][] {
  const path: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = sx + (gx - sx) * t;
    const y = sy + (gy - sy) * t;
    path.push([x, y]);
  }

  return path;
}
