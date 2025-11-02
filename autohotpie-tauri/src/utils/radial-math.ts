/**
 * Radial Menu Mathematics
 * Based on Kando's circular menu calculations
 */

export interface Point {
  x: number;
  y: number;
}

export interface SegmentAngles {
  start: number;
  end: number;
  center: number;
}

/**
 * Convert polar coordinates to cartesian
 * @param centerX - X coordinate of center
 * @param centerY - Y coordinate of center
 * @param radius - Distance from center
 * @param angleInDegrees - Angle in degrees (0° = top, clockwise)
 */
export function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
): Point {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

/**
 * Generate SVG path for a wedge (pie slice)
 * @param centerX - X coordinate of center
 * @param centerY - Y coordinate of center
 * @param innerRadius - Inner radius (for donut shape)
 * @param outerRadius - Outer radius
 * @param startAngle - Start angle in degrees
 * @param endAngle - End angle in degrees
 */
export function getWedgePath(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const outerStart = polarToCartesian(centerX, centerY, outerRadius, endAngle);
  const outerEnd = polarToCartesian(centerX, centerY, outerRadius, startAngle);
  const innerStart = polarToCartesian(centerX, centerY, innerRadius, endAngle);
  const innerEnd = polarToCartesian(centerX, centerY, innerRadius, startAngle);

  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M',
    outerStart.x,
    outerStart.y,
    'A',
    outerRadius,
    outerRadius,
    0,
    largeArcFlag,
    0,
    outerEnd.x,
    outerEnd.y,
    'L',
    innerEnd.x,
    innerEnd.y,
    'A',
    innerRadius,
    innerRadius,
    0,
    largeArcFlag,
    1,
    innerStart.x,
    innerStart.y,
    'Z',
  ].join(' ');
}

/**
 * Calculate angles for all segments in a pie menu
 * @param segmentCount - Number of segments
 * @param gapDegrees - Gap between segments in degrees
 * @returns Array of segment angles
 */
export function calculateSegmentAngles(
  segmentCount: number,
  gapDegrees: number = 4
): SegmentAngles[] {
  if (segmentCount <= 0) {
    return [];
  }

  const totalGap = gapDegrees * segmentCount;
  const availableAngle = 360 - totalGap;
  const segmentAngle = availableAngle / segmentCount;

  return Array.from({ length: segmentCount }, (_, i) => {
    const start = i * (segmentAngle + gapDegrees);
    const end = start + segmentAngle;
    const center = start + segmentAngle / 2;

    return { start, end, center };
  });
}

/**
 * Get position for a label at the center angle of a segment
 * @param centerX - X coordinate of center
 * @param centerY - Y coordinate of center
 * @param radius - Distance from center
 * @param centerAngle - Center angle of segment in degrees
 */
export function getLabelPosition(
  centerX: number,
  centerY: number,
  radius: number,
  centerAngle: number
): Point {
  return polarToCartesian(centerX, centerY, radius, centerAngle);
}

/**
 * Calculate if a point is inside a wedge segment
 * @param point - Point to check
 * @param center - Center of the pie
 * @param innerRadius - Inner radius
 * @param outerRadius - Outer radius
 * @param startAngle - Start angle in degrees
 * @param endAngle - End angle in degrees
 */
export function isPointInWedge(
  point: Point,
  center: Point,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): boolean {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Check radius
  if (distance < innerRadius || distance > outerRadius) {
    return false;
  }

  // Calculate angle (-90 because 0° is at top)
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (angle < 0) {
    angle += 360;
  }

  // Normalize angles
  const normalizedStart = startAngle % 360;
  const normalizedEnd = endAngle % 360;

  // Check if angle is within segment
  if (normalizedStart <= normalizedEnd) {
    return angle >= normalizedStart && angle <= normalizedEnd;
  } else {
    // Handle wrap around 360
    return angle >= normalizedStart || angle <= normalizedEnd;
  }
}

/**
 * Calculate responsive radius based on window size
 * @param windowWidth - Window width in pixels
 * @param windowHeight - Window height in pixels
 * @param minRadius - Minimum radius
 * @param maxRadius - Maximum radius
 */
export function getResponsiveRadius(
  windowWidth: number,
  windowHeight: number,
  minRadius: number = 100,
  maxRadius: number = 200
): number {
  const minDimension = Math.min(windowWidth, windowHeight);

  // Use 60% of smaller dimension, divided by 2 for radius
  const calculatedRadius = (minDimension * 0.6) / 2;

  // Clamp between min and max
  return Math.max(minRadius, Math.min(calculatedRadius, maxRadius));
}

/**
 * Get line path for wedge separator
 * @param centerX - X coordinate of center
 * @param centerY - Y coordinate of center
 * @param innerRadius - Inner radius
 * @param outerRadius - Outer radius
 * @param angle - Angle in degrees
 */
export function getSeparatorPath(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  angle: number
): string {
  const inner = polarToCartesian(centerX, centerY, innerRadius, angle);
  const outer = polarToCartesian(centerX, centerY, outerRadius, angle);

  return `M ${inner.x} ${inner.y} L ${outer.x} ${outer.y}`;
}
