/**
 * The name a new lecture gets when nobody gives it one: the course and when
 * it started, in the student's zone, e.g. "Biology lecture 30 Oct, 10:04", or
 * "Lecture 30 Oct, 10:04" when it is filed under no course. Easy to rename.
 */
export function defaultLectureTitle(course: string | null, at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  const when = `${part('day')} ${part('month')}, ${part('hour')}:${part('minute')}`
  const name = course ? `${course.charAt(0).toUpperCase()}${course.slice(1)} lecture` : 'Lecture'
  return `${name} ${when}`
}
