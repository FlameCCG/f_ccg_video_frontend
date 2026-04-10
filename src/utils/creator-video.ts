import { createTag } from '@/api/user'

const MAX_TAG_COUNT = 10

export const normalizeCreatorTags = (tags: string[]) => {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, MAX_TAG_COUNT)
}

export const resolveCreatorTagIds = async (tags: string[]) => {
  const normalizedTags = normalizeCreatorTags(tags)
  if (normalizedTags.length === 0) return []

  const createdTags = await Promise.all(normalizedTags.map((name) => createTag({ name })))
  return createdTags.map((tag) => tag.id)
}
