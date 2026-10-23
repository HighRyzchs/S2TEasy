import type { OverlayPosition } from './types'

export function overlayCoordinates(
  area: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number },
  position: OverlayPosition,
  offset = { x: 0, y: 0 }
) {
  const left = position.includes('left') || position === 'left'
  const right = position.includes('right') || position === 'right'
  const top = position.includes('top')
  const bottom = position.includes('bottom')
  const x = left ? 20 : right ? area.width - size.width - 20 : (area.width - size.width) / 2
  const y = top ? 20 : bottom ? area.height - size.height - 20 : (area.height - size.height) / 2
  return {
    x: area.x + Math.round(Math.max(0, Math.min(area.width - size.width, x + offset.x))),
    y: area.y + Math.round(Math.max(0, Math.min(area.height - size.height, y + offset.y)))
  }
}
