# Sonidos del panel admin

## new-order.mp3

Reemplazar `new-order.mp3` con un archivo MP3 real (~1s) antes de producción.

El archivo actual es un placeholder mínimo para que la pipeline no falle.
`playNewOrderSound()` envuelve `audio.play()` en try/catch y nunca lanza —
si el archivo es inválido el browser falla silenciosamente.

Recurso sugerido: https://freesound.org (licencia CC0)
