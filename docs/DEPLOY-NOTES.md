# Notas de deploy

## El build ya no toca el schema de la base

`package.json` tenía este build script:

```
if [ "$VERCEL_ENV" = "preview" ]; then
  prisma db push --accept-data-loss && prisma generate && next build
else
  prisma generate && next build
fi
```

La intención era razonable: que un deploy de preview levante con el
schema de su propia rama. El problema es cómo está armado este proyecto.

**Los deploys de la rama `staging` son deploys de tipo preview**
(`target: null` en la API de Vercel), y **staging comparte base de datos
con producción** — verificado 2026-06-26: un signup hecho en
`recruitingats.com` aparece en la base contra la que escribe staging.

Juntando las dos cosas: cada push a `staging` corría
`prisma db push --accept-data-loss` contra la base de producción. El
flag `--accept-data-loss` es exactamente el que le saca a Prisma el
freno de mano: le dice "aplicá el cambio aunque implique perder datos".
Mientras el schema no cambiara era un no-op silencioso, pero el día que
alguien editara `prisma/schema.prisma` y pusheara a staging, un build
podía dropear columnas o tablas en producción sin que nadie lo pidiera.

Ahora el build es siempre `prisma generate && next build`. No toca el
schema.

## Entonces, ¿cómo se aplica un cambio de schema?

A mano y a propósito, coordinando con el deploy:

1. Editar `prisma/schema.prisma`.
2. Aplicar el cambio a la base (`npx prisma db push`, **sin**
   `--accept-data-loss`, para que Prisma frene si el cambio es
   destructivo).
3. Recién ahí pushear el código.

El orden importa: si el código llega antes que la columna, Prisma
rompe en cualquier query de esa tabla. Para columnas nuevas, agregarlas
primero es seguro — el código viejo las ignora.

## Pendiente de fondo

Separar la base de staging de la de producción. Mientras compartan
base, cualquier prueba en staging escribe sobre datos reales y no hay
ningún entorno donde equivocarse salga gratis. Tiene que resolverse
antes del primer cliente pago.
