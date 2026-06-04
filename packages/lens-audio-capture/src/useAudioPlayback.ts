import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Playback driven by the real `<audio>` element: `position` (ms) comes from
 * `timeupdate` (audio.currentTime), so the progress UI tracks actual playback
 * rather than a parallel timer. Pass `url = null` while there is nothing to play.
 */
export function useAudioPlayback(url: string | null) {
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audioRef.current = null
    }
    setPlaying(false)
    setPosition(0)
  }, [])

  // Discard the element when the source changes or on unmount.
  useEffect(() => stop, [url, stop])

  const toggle = useCallback(() => {
    if (!url) return

    if (playing) {
      audioRef.current?.pause()
      setPlaying(false)
      return
    }

    let audio = audioRef.current
    if (!audio) {
      audio = new Audio(url)
      const el = audio
      el.ontimeupdate = () => setPosition(el.currentTime * 1000)
      el.onended = () => {
        setPlaying(false)
        setPosition(0)
        audioRef.current = null
      }
      audioRef.current = el
    }
    audio.play()
    setPlaying(true)
  }, [url, playing])

  return { playing, position, toggle, stop }
}
