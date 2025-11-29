# CaminoSeguro Backend API

Backend para la aplicación de seguridad vial **CaminoSeguro**. API REST construida con Node.js, Express y PostgreSQL.

## 🚀 Características

- **Autenticación JWT** para usuarios y autoridades
- **Gestión de reportes/incidentes** con geolocalización
- **Puntos de ayuda** (comisarías, hospitales, bomberos, etc.)
- **Rutas seguras** con cálculo de score de seguridad
- **Alertas** en tiempo real
- **Mapas de calor** basados en incidentes
- **Estadísticas y dashboard** para autoridades

## 📋 Requisitos

- Node.js >= 18.0.0
- PostgreSQL (puedes usar Render PostgreSQL)

## 🛠️ Instalación Local

1. Clona el repositorio:
```bash
git clone <tu-repo>
cd backend
```

2. Instala las dependencias:
```bash
npm install
```

3. Copia el archivo de configuración:
```bash
cp .env.example .env
```

4. Configura las variables de entorno en `.env`:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgres://usuario:contraseña@localhost:5432/camino_seguro
JWT_SECRET=tu_secreto_super_seguro
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5500
```

5. Inicia el servidor:
```bash
# Desarrollo
npm run dev

# Producción
npm start
```

## 🌐 Deploy en Render

### 1. Crear Base de Datos PostgreSQL en Render

1. Ve a [Render Dashboard](https://dashboard.render.com/)
2. Click en **New** → **PostgreSQL**
3. Configura:
   - Name: `camino-seguro-db`
   - Database: `camino_seguro`
   - User: `camino_user`
   - Region: (elige la más cercana)
   - Plan: Free (o el que prefieras)
4. Click en **Create Database**
5. Copia la **Internal Database URL** o **External Database URL**

### 2. Deploy del Backend en Render

1. Sube tu código a GitHub
2. En Render Dashboard, click en **New** → **Web Service**
3. Conecta tu repositorio de GitHub
4. Configura:
   - Name: `camino-seguro-api`
   - Region: (misma que la base de datos)
   - Branch: `main`
   - Root Directory: `backend` (si el backend está en una subcarpeta)
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
5. En **Environment Variables**, agrega:
   ```
   DATABASE_URL = (pega la Internal Database URL de tu PostgreSQL)
   JWT_SECRET = (genera un secreto seguro)
   JWT_EXPIRES_IN = 7d
   NODE_ENV = production
   FRONTEND_URL = https://tu-frontend.com
   ```
6. Click en **Create Web Service**

## 📚 Endpoints de la API

### Autenticación (`/api/auth`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/register` | Registro de usuarios |
| POST | `/register-authority` | Registro de autoridades |
| POST | `/login` | Inicio de sesión |
| POST | `/forgot-password` | Recuperar contraseña |

### Usuarios (`/api/users`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/me` | Obtener perfil actual |
| PUT | `/me` | Actualizar perfil |
| PUT | `/me/password` | Cambiar contraseña |
| GET | `/notifications` | Obtener notificaciones |

### Reportes (`/api/reports`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Listar reportes |
| GET | `/:uuid` | Obtener reporte |
| POST | `/` | Crear reporte |
| PUT | `/:uuid/status` | Actualizar estado (autoridades) |
| GET | `/user/my-reports` | Mis reportes |

### Puntos de Ayuda (`/api/help-points`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Listar puntos de ayuda |
| GET | `/types` | Tipos de puntos |
| GET | `/:uuid` | Obtener punto |
| POST | `/` | Crear punto (autoridades) |
| PUT | `/:uuid` | Actualizar punto (autoridades) |
| DELETE | `/:uuid` | Eliminar punto (autoridades) |

### Rutas Seguras (`/api/routes`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Mis rutas guardadas |
| POST | `/calculate` | Calcular ruta segura |
| POST | `/` | Guardar ruta |
| PUT | `/:uuid/favorite` | Marcar favorita |
| DELETE | `/:uuid` | Eliminar ruta |

### Alertas (`/api/alerts`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Listar alertas activas |
| GET | `/types` | Tipos de alertas |
| GET | `/:uuid` | Obtener alerta |
| POST | `/` | Crear alerta (autoridades) |
| PUT | `/:uuid` | Actualizar alerta (autoridades) |
| DELETE | `/:uuid` | Desactivar alerta (autoridades) |

### Mapa de Calor (`/api/heatmap`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Datos del mapa de calor |
| GET | `/types` | Tipos de zonas |
| GET | `/summary` | Resumen de zonas |
| GET | `/high-risk` | Zonas de alto riesgo |

### Estadísticas (`/api/stats`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Estadísticas generales |
| GET | `/dashboard` | Dashboard (autoridades) |
| GET | `/reports-trend` | Tendencia de reportes |
| GET | `/safety-score` | Score de seguridad por zona |

## 🔐 Autenticación

La API usa JWT (JSON Web Tokens). Incluye el token en el header:

```
Authorization: Bearer <tu_token>
```

## 📍 Filtros de Geolocalización

La mayoría de endpoints soportan filtros por ubicación:

```
GET /api/reports?lat=-12.0464&lng=-77.0428&radius=5
```

- `lat`: Latitud
- `lng`: Longitud  
- `radius`: Radio en kilómetros

## 🤝 Contribuir

1. Fork el proyecto
2. Crea tu rama (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## 📄 Licencia

MIT License
