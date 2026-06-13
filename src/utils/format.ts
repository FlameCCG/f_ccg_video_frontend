export const levelColor = (level: number): string => {
  if (level >= 6) return '#ff6699'
  if (level >= 4) return '#ffb636'
  if (level >= 2) return '#7bcfa6'
  return '#c0c0c0'
}

export const formatCount = (n: number, opts?: { hideZero?: boolean }): string => {
  if (opts?.hideZero && n <= 0) return ''
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n)
}

export const formatDuration = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export const formatClock = (seconds: number): string => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
