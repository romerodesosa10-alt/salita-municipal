# Salita Municipal

Aplicación integradora para organizar médicos, pacientes, consultorios y turnos. Frontend React + TypeScript y backend educativo Node.js, construido a partir de los componentes originales de turno.

## Ejecutar

Requiere **Node.js 22.18 o superior**, npm y dos puertos libres: 5173 y 3001.

```sh
npm ci
npm start
```

Abrir **http://127.0.0.1:5173**. `npm start` inicia la API y Vite; Ctrl+C detiene ambos.

Accesos educativos iniciales: **admin / Salita2026!** para la salita central y **superadmin / SuperSalita2026!** para el portal global. Los clientes crean su cuenta desde **Registrate acá**. Los registros iniciales son ficticios. Ver [PORTALES.md](PORTALES.md).

También se pueden iniciar por separado en dos terminales:

```sh
npm run server
npm run dev
```

## Funcionalidad

- Registro público de clientes, cuentas persistidas con contraseñas derivadas con scrypt y login contra `POST /api/v1/auth/login`, verificación de sesión al recargar y cierre de sesión en servidor.
- `AuthGuard` y `RoleGuard` protegen todos los módulos y separan superadmin, admin y cliente. Preserva el destino solicitado al ingresar y redirige al recibir un HTTP 401.
- Layout con navegación global, menú móvil y pantalla 404.
- Listados independientes de pacientes, médicos, consultorios y turnos; búsquedas, filtros, skeletons, errores, reintentos y estados vacíos.
- Cuatro formularios de alta con validaciones Zod antes del POST y en el backend; errores por campo, foco en el primer error y notificaciones Sonner.
- Selección de paciente/médico/consultorio al crear un turno, fecha futura y prevención de superposición (intervalos de 30 minutos).
- Detalle de turno y marcado como atendido, recuperados de los componentes aportados.
- Persistencia local de registros en `server/data/salita.json`. Las sesiones viven en memoria durante ocho horas; reiniciar la API invalida las sesiones sin borrar los registros.

## Arquitectura

```text
src/
  auth/         AuthContext, AuthGuard y sesión
  components/   Layout, TurnoCard y feedback de carga/error
  hooks/        useFetch con cancelación y reintento
  lib/          Axios, errores y metadatos de entidades
  pages/        Login, dashboard, listados, formularios y detalle
shared/         Schemas Zod y contratos TypeScript
server/         API HTTP y persistencia JSON local
tests/          Pruebas de integración de la API
e2e/            Pruebas de flujos con navegador
```

`useFetch<T>` centraliza las consultas GET, cancela peticiones al desmontar el componente y expone `data`, `isLoading`, `error` y `refetch`. Una instancia Axios configura URL, timeout y Authorization. El token se conserva en sessionStorage y se valida con el servidor; escribir un token cualquiera en el navegador no concede acceso a la API.

## API local

Base: `http://127.0.0.1:3001/api/v1`.

| Método | Ruta | Función |
| --- | --- | --- |
| POST | `/auth/login` | `{ usuario, password }` → `{ token, usuario }` |
| GET | `/auth/me` | Verifica el token y devuelve el usuario |
| POST | `/auth/logout` | Revoca el token |
| GET / POST | `/pacientes` | Listar / crear pacientes |
| GET / POST | `/medicos` | Listar / crear médicos |
| GET / POST | `/consultorios` | Listar / crear consultorios |
| GET / POST | `/turnos` | Listar / crear turnos |
| GET | `/turnos/:id` | Detalle con relaciones completas |
| PATCH | `/turnos/:id/atender` | Marcar atendido |
| GET | `/health` | Comprobar disponibilidad sin sesión |

Las rutas de datos requieren `Authorization: Bearer TOKEN`. La respuesta es `{ ok, mensaje, data, errores? }`. Al crear un turno se envían IDs para `paciente`, `medico` y `consultorio`, y una fecha ISO para `fechaTurno`; las consultas devuelven las relaciones completas. Los contratos exactos están en `shared/schemas.ts`.

Para conectar otro backend: copiar `.env.example` a `.env.local` y cambiar `VITE_API_URL`. Reiniciar Vite. Además hay que adaptar rutas/campos/respuestas a ese contrato real: no se ha verificado compatibilidad con un backend del curso, ya que no fue proporcionado.

## Validación

```sh
npm run build
npm test
npm run test:e2e
```

Las pruebas de API usan un archivo de datos aislado y comprueban acceso sin sesión, credenciales incorrectas, validación de los cuatro módulos, altas, duplicados, relaciones inexistentes, superposiciones, persistencia tras reinicio y revocación de sesión.

Las pruebas de navegador necesitan Google Chrome instalado (o cambiar `channel` en `playwright.config.ts`). Inician su propia API en 3003 y Vite en 5174, separados de la aplicación en 5173. Usan datos aislados y comprueban guardián, login, alta de las cuatro entidades, detalle, atención, búsquedas, fallas de red, reintentos, sesión revocada, carga y navegación móvil.

Para compilar y servir el frontend compilado: `npm run build`, `npm run server` en una terminal y `npm run preview` en otra. En un hosting, las rutas de la SPA necesitan reescritura a `index.html`.

## Entrega mediante Pull Request

El repositorio local tiene una base `main` con los componentes originales y una rama `feature/frontend-integrador` con la implementación. La entrega es **el enlace del PR**, no el enlace de la página del repositorio. El texto preparado está en `.github/PULL_REQUEST_BODY.md`.

Si todavía no existe un repositorio remoto, crear uno vacío en GitHub y luego:

```sh
git remote add origin URL_DEL_REPOSITORIO
git push -u origin main
git push -u origin feature/frontend-integrador
```

En GitHub, abrir un PR desde `feature/frontend-integrador` hacia `main`, usar el texto preparado y copiar su enlace como entrega.

## Alcance del backend

El backend fue agregado porque solo se contaba con componentes sueltos, sin API ni repositorio. El login inicial de la consigna se amplió con registro de clientes, cuentas persistidas, hash de contraseñas y permisos por rol y salita. Usa almacenamiento JSON para que se pueda ejecutar sin instalar MongoDB. No es una solución de producción ni una implementación de los requisitos completos del proyecto final del curso: no incorpora MongoDB, verificación de email, recuperación de contraseña ni despliegue de producción. Los permisos por rol y por salita sí están implementados. Debe usarse localmente con datos de práctica.

Los archivos originales permanecen en `referencias-originales`. La lista de pacientes aportada se normalizó a JSON válido y se eliminaron duplicados en una copia local; esa lista y el fragmento de configuración sin extensión están excluidos de Git. La aplicación arranca con una semilla ficticia independiente.

## Referencias técnicas

- [React Router: rutas y layouts](https://reactrouter.com/start/declarative/routing)
- [Axios: cancelación de peticiones](https://axios-http.com/docs/cancellation)

Para conectar MongoDB Atlas y publicar la web, consultá [ATLAS.md](ATLAS.md).
