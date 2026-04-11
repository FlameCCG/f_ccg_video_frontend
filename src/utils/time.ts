export function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  if (diff < 2592000000) return Math.floor(diff / 86400000) + '天前'
  return new Date(timestamp).toLocaleDateString()
}

export function formatDateTimeAgo(dateTime?: string | number | Date | null): string {
  if (!dateTime) return '刚刚'

  const timestamp =
    dateTime instanceof Date
      ? dateTime.getTime()
      : typeof dateTime === 'number'
        ? dateTime
        : new Date(dateTime).getTime()

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '刚刚'
  }

  return formatTimeAgo(timestamp)
}
