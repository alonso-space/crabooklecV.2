# AGENTS.md: CRAbook (fork de crabooklecV.2)

Guía para quien trabaje en este repo, sea persona o agente. Léela antes de tocar código y sigue `pendiente.txt` para saber qué falta.

## Objetivo

Sistema de biblioteca para un liceo: catálogo de libros, usuarios, préstamos y boletas impresas. Debe ser **plug-and-play**: la profe de la biblioteca usa el sistema, la pistola lectora y la impresora térmica de boletas **sin tocar comandos**. Los administradores (Sotelec: dos estudiantes en práctica) pueden entrar a los equipos a revisar.

Contexto de despliegue:

- La red de la biblioteca y la del laboratorio TP son distintas.
- Plan: servidor Linux en el laboratorio con Docker Compose (MariaDB + app), alcanzado desde la PC de la profe por Tailscale (o por IP directa si la red lo permite, por verificar). La PC de la profe es Windows.
- La pistola lectora funciona como teclado USB: no requiere nada.
- La impresión es el único punto delicado: quien imprime debe estar en la PC con el cable USB. Decisión de diseño: **el backend devuelve los datos de la boleta y el cliente la imprime** (navegador con `--kiosk-printing` y boleta en HTML/CSS de 58/80 mm; Electron delgado solo si eso falla). Docker/WSL en la PC de la profe está descartado.

## Stack

Node 22 + Express 5 + Knex + MariaDB 10.11 (backend), React + Vite (cliente). El backend sirve `client/dist`. Hay un Electron en `electron/` con el servidor embebido

## Estructura

- `server/`: `app.js`, `src/` (rutas en `routes/api.js`, servicios, `auth.js`, `imagenes.js`, `impresora/boleta.js`), `crear-cuentas.js`, `db-crabook.sql`.
- `client/`: app React (`src/pages`, `src/components`).
- `Dockerfile` y `docker-compose.yml` en la raíz. Un único `.env` en la raíz (plantilla: `.env.example`).
- Volúmenes: `db_data` (MariaDB) y `uploads_data` (portadas, en `/app/server/uploads`).

## Comandos

```bash
docker compose up -d --build                 # levantar todo
docker compose logs -f app                   # logs de la app
docker compose exec app npm run crear-cuentas   # crear/actualizar cuentas (interactivo)
docker compose down                          # apagar (conserva datos)
```

`docker compose down -v` **borra los volúmenes (datos y portadas)**: no lo uses sin avisar y sin respaldo.

## Convenciones de código

- Nombres (variables, funciones, archivos nuevos) en **inglés**; comentarios en **español**.
- El código heredado del repo original usa nombres en español: no se renombra en masa. La convención aplica al código nuevo.
- Código limpio: nombres claros, funciones pequeñas, un solo propósito por módulo.
- Commits pequeños y descriptivos; cambios propios (Docker, impresión, seguridad) en ramas separadas para distinguirlos de lo heredado.
- Si se agrega lógica no trivial (por ejemplo la fecha de devolución), se agrega su test.

## Normas de seguridad (prioridad alta)

- Nunca credenciales ni secretos en el código, en Git ni pegados en chats. `.env` fuera de Git y con `chmod 600`. Si una clave se filtró, se regenera.
- `AUTH_SECRET` de al menos 16 caracteres (mejor `openssl rand -hex 32`).
- Validar **en el servidor** toda entrada: tipo, largo y rango (los límites salen del esquema SQL). No confiar en el cliente.
- Manejar errores con mensajes claros al usuario, sin filtrar stack traces ni detalles internos.
- Mínimo privilegio: el contenedor corre como `node`, la BD no publica puerto, la app escucha en `127.0.0.1` por defecto (`BIND_ADDRESS`). Exponer con `tailscale serve`, no abriendo a toda la red.
- Subidas de archivos: se valida tipo, tamaño y bytes mágicos, y el nombre en disco lo genera el servidor. Mantener ese estándar.
- No pasar a la app más variables que las que usa (nada de `env_file: .env` en `app`: filtraría `DB_ROOT_PASSWORD`).

## Normas de trabajo

- Ir directo al punto; si algo es ambiguo, preguntar antes de actuar.
- No agregar dependencias sin una razón concreta (evitar bloat). Si se agrega una, decir para qué sirve.
- No cambiar lo que no se pidió. Mientras se trabaja una tarea, no proponer ideas nuevas fuera de ella.
- Explicar el porqué de cada decisión, no solo el código.
- Si hay varias formas de hacer algo, indicar cuál se recomienda y por qué.
- Si algo no se pudo probar (por ejemplo, Docker en el entorno del agente o la impresora real), decirlo en vez de afirmarlo.
- No borrar `server/src/impresora/boleta.js` ni las variables `IMPRESORA_*` hasta validar la impresión en el cliente con la impresora real.

## Licencia y autoría

AGPL-3.0. Proyecto original de Rohus7373 (`github.com/Rohus7373/crabooklecV.2`); este repo es un fork para adaptarlo al liceo. Conservar `LICENSE` y el crédito a la autora, y mantener el código fuente de esta versión disponible para quienes la usen.
