# Malleable PLS - Technical Constraints & Decisions

## Delivery Model

Web-first team. Core expertise is web apps. Target delivery:
- **Desktop**: Web app (PWA), potentially Tauri wrapper later if needed
- **Mobile**: Capacitor wrapper around the web app (team has some existing experience)
- **Web**: PWA for zero-install access (review/study sessions)

One web codebase, native wrappers only where the browser falls short.

---

## Mobile Web Limitations (without a native wrapper)

These are the known constraints of running as a pure web app on mobile, and the primary motivation for using Capacitor on mobile.

### Storage quotas and eviction

| Browser | Quota | Eviction risk |
|---------|-------|---------------|
| Chrome/Edge | ~60% of disk per origin | Can evict under storage pressure unless user grants "persistent storage" permission |
| Safari | 1GB default, then prompts in 200MB increments | Can wipe data after ~7 days of inactivity (ITP). Relaxed for homescreen PWAs but inconsistent |
| Firefox | ~10% of disk per origin | Subject to eviction under storage pressure |

**On iOS, all browsers use Safari's WebKit engine** — so Safari's limits apply to Chrome, Firefox, etc. on iPhone and iPad.

Audio is the critical pressure: ~50-100MB per hour of lecture. A student recording 10-15 hours/week generates ~1-1.5GB/week, ~15GB+ per semester. Safari's 1GB cap with manual prompting makes this unworkable for the primary recording use case.

### Background audio recording
- Safari/iOS: kills background audio recording when the app is backgrounded or the screen locks. Students switching apps mid-lecture lose their recording.
- Chrome/Android: slightly better with background service workers, but unreliable and varies by device/OS version.

### Microphone access
- Web audio APIs work but are less reliable than native — especially around permissions persistence, echo cancellation, and handling interruptions (phone calls, notifications).
- Capacitor gives direct access to native audio recording APIs, which are more robust.

### Offline support
- Service workers and OPFS provide offline capability, but the storage quota limits above apply to the offline cache too.
- A native wrapper gives true file system access — no quotas, no eviction, no browser-imposed limits.

### Other gaps
- No reliable push notifications on iOS web (added in iOS 16.4+ for homescreen PWAs, but adoption/reliability is still patchy)
- No background sync (uploading recordings when back online is harder without native background task APIs)
- Haptic feedback, native share sheets, and other platform integration missing

### Summary

| Capability | Web (mobile browser) | Capacitor wrapper |
|------------|---------------------|-------------------|
| Audio recording (foreground) | Works, less reliable | Native, robust |
| Audio recording (background) | Broken on iOS, flaky on Android | Works |
| Storage | Quota-limited, eviction risk | Unlimited file system |
| Offline | Works within quota limits | Full offline support |
| Push notifications | iOS 16.4+ homescreen only | Native |
| Background upload/sync | Very limited | Native background tasks |

**Conclusion**: Pure web is viable for the review/study side of the platform (non-recording activities, lighter storage needs). Audio capture on mobile almost certainly needs a Capacitor wrapper. The team's existing Capacitor experience makes this a reasonable path.
