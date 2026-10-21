import { getDanmuMonthDateList } from '@/api/danmu'

const MAX_MONTHS = 12
const CACHE_TTL_MS = 60_000

interface MonthCache {
  dates: Set<string>
  expires: number
}

const cache = new Map<string, MonthCache>()
const pending = new Map<string, Promise<Set<string>>>()

const monthKey = (
  videoId: number,
  partId: number | undefined,
  year: number,
  month: number,
  tzOffset: number
) => `${videoId}:${partId ?? 0}:${year}-${month}:${tzOffset}`

/** 把绝对时间折成浏览器本地的 YYYY-MM-DD。 */
export const localDateKey = (value: Date): string => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const remember = (key: string, dates: Set<string>) => {
  cache.delete(key)
  cache.set(key, { dates, expires: Date.now() + CACHE_TTL_MS })
  if (cache.size > MAX_MONTHS) cache.delete(cache.keys().next().value!)
}

/**
 * 一次取回该本地月份里有弹幕的日期。
 * 后端只给上海时间的发送时刻，这里按浏览器时区换成日历日。失败不缓存。
 */
export const getDanmuMonthDates = (
  videoId: number,
  partId: number | undefined,
  year: number,
  month: number
): Promise<Set<string>> => {
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 1)
  const key = monthKey(videoId, partId, year, month, monthStart.getTimezoneOffset())
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) return Promise.resolve(new Set(cached.dates))

  const inFlight = pending.get(key)
  if (inFlight) return inFlight

  const monthText = `${year}-${String(month + 1).padStart(2, '0')}`
  const task = getDanmuMonthDateList({
    videoId,
    partId,
    month: monthText,
    start: monthStart.toISOString(),
    end: monthEnd.toISOString(),
  })
    .then((result) => {
      if (!Array.isArray(result.times)) throw new Error('日期标记格式不正确')
      const dates = new Set<string>()
      for (const raw of result.times) {
        const parsed = new Date(raw)
        if (Number.isNaN(parsed.getTime())) continue
        dates.add(localDateKey(parsed))
      }
      remember(key, dates)
      return new Set(dates)
    })
    .finally(() => pending.delete(key))

  pending.set(key, task)
  return task
}
