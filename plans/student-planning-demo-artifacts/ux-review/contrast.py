import math
def oklch(L, C, h):
    a = C * math.cos(math.radians(h)); b = C * math.sin(math.radians(h))
    l_ = L + 0.3963377774*a + 0.2158037573*b
    m_ = L - 0.1055613458*a - 0.0638541728*b
    s_ = L - 0.0894841775*a - 1.2914855480*b
    l, m, s = l_**3, m_**3, s_**3
    r = 4.0767416621*l - 3.3077115913*m + 0.2309699292*s
    g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
    bb = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
    return [min(1, max(0, x)) for x in (r, g, bb)]
def hexrgb(h):
    h = h.lstrip('#'); return [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
def to_srgb(lin):
    return [12.92*x if x <= 0.0031308 else 1.055*x**(1/2.4)-0.055 for x in lin]
def lum_lin(lin): return 0.2126*lin[0]+0.7152*lin[1]+0.0722*lin[2]
def lum_srgb(c):
    lin = [x/12.92 if x <= 0.04045 else ((x+0.055)/1.055)**2.4 for x in c]
    return lum_lin(lin)
def ratio(a, b):
    la, lb = sorted([a, b], reverse=True); return (la+0.05)/(lb+0.05)
raised_light = lum_lin(oklch(0.99, 0.006, 60))
raised_dark = lum_lin(oklch(0.178, 0.010, 60))
print('amber-200 on light raised', ratio(lum_srgb(hexrgb('fee685')), raised_light))
print('amber-300 on light raised', ratio(lum_srgb(hexrgb('ffd236')), raised_light))
print('text-muted light', ratio(lum_lin(oklch(0.65, 0.005, 60)), raised_light))
print('text-muted dark', ratio(lum_lin(oklch(0.45, 0.005, 60)), raised_dark))
print('text-secondary light', ratio(lum_lin(oklch(0.45, 0.005, 60)), raised_light))
print('amber-200 on dark', ratio(lum_srgb(hexrgb('fee685')), raised_dark))
