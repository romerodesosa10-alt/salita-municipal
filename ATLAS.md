# Salita Municipal con Atlas

Esta edición conserva los tres portales de la versión del 28/10. Para Atlas se crea una base nueva. Los registros JSON y las cuentas de demostración quedan en el modo local.

## Probar en tu PC con la base en Atlas

1. En [MongoDB Atlas](https://cloud.mongodb.com/), creá un clúster y un usuario de base de datos con permisos de lectura y escritura sobre `salita_municipal`. Agregá la IP desde la que va a conectarse la aplicación y copiá la cadena de conexión para Node.js desde **Connect → Drivers**.
2. En una terminal PowerShell ubicada en `salita-municipal`, copiá `.env.example` a `.env` si todavía no existe. Definí `MONGODB_URI` con la cadena de Atlas y `SUPERADMIN_PASSWORD` con una contraseña única de al menos 16 caracteres. Conservá la URI como secreto del backend.
3. Ejecutá estos comandos.

   ```powershell
   npm.cmd ci
   npm.cmd run build
   npm.cmd run start:online
   ```

4. Abrí [la página local conectada a Atlas](http://localhost:3001/) e ingresá con el usuario `superadmin` y la contraseña del primer arranque. Creá el administrador de la salita desde ese portal. Cambiar la variable después del primer arranque no cambia la contraseña ya guardada.

## Abrir la página desde Internet

1. En [Render](https://dashboard.render.com/), conectá un repositorio propio que contenga esta carpeta y creá un **Web Service** de Node con una sola instancia. Si el repositorio contiene solo esta aplicación, dejá vacío **Root Directory**. Si subiste una carpeta contenedora, elegí `salita-municipal`.
2. Usá **Build Command** `npm ci && npm run build`, **Start Command** `npm run start:online` y **Health Check Path** `/api/v1/health`.
3. Cargá `MONGODB_URI`, `MONGODB_DATABASE` y `SUPERADMIN_PASSWORD` como variables del servicio. Agregá en Atlas los rangos de salida del servicio Render. Conservá `VITE_API_URL` vacío para que la web use la API en el mismo dominio.
4. Abrí la URL HTTPS que Render asigna al servicio. Esa es la dirección que podés compartir. El despliegue se puede iniciar con datos ficticios para probar los accesos.

Documentación oficial de [conexión a Atlas](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/), [servicios web de Render](https://render.com/docs/web-services) y [rangos de salida de Render](https://render.com/docs/outbound-ip-addresses).

El modo Atlas conserva los registros de esta edición educativa en un documento de MongoDB y mantiene las sesiones en memoria. Está preparado para una sola instancia y datos de prueba. Los reinicios cierran las sesiones.

## Compartir la demostración con Vercel

1. Subí el contenido de esta carpeta a un repositorio privado. El archivo `.env` y los datos locales de `server/data` están excluidos por Git.
2. Importá el repositorio en Vercel y elegí la carpeta que contiene `package.json` y `vercel.json`. Vercel asignará un dominio HTTPS terminado en `.vercel.app`.
3. En Atlas, creá un usuario para la demostración con acceso de lectura y escritura a `salita_municipal_demo`.
4. En Render, importá el repositorio como **Blueprint**. Completá `MONGODB_URI` y `SUPERADMIN_PASSWORD` con las credenciales de la demostración. Usá el dominio HTTPS de Vercel como `FRONTEND_ORIGIN`. Agregá a Atlas los rangos de salida del servicio Render. Si el primer arranque falla mientras configurás Atlas, relanzá el despliegue tras habilitar el acceso.
5. En Vercel, definí `VITE_API_URL` con la URL HTTPS de Render seguida de `/api/v1` y volvé a desplegar. Esta variable contiene una URL pública. La URI de Atlas y la contraseña del superadministrador se cargan en Render.
6. Comprobá que `/api/v1/health` en Render indique `"storage": "mongodb"`. Abrí `/login` en Vercel y probá el registro, el inicio de sesión y los turnos con datos ficticios.
