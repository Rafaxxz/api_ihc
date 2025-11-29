require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Importar rutas
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const reportRoutes = require('./routes/report.routes');
const helpPointRoutes = require('./routes/helpPoint.routes');
const routeRoutes = require('./routes/route.routes');
const alertRoutes = require('./routes/alert.routes');
const heatmapRoutes = require('./routes/heatmap.routes');
const statsRoutes = require('./routes/stats.routes');

// Importar base de datos
const { initDatabase } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS - Permitir múltiples orígenes
const allowedOrigins = [
  'https://rafaxxz.github.io',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:8080'
];

app.use(cors({
  origin: function(origin, callback) {
    // Permitir requests sin origin (como mobile apps o curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(null, true); // Permitir todos en producción por ahora
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

// Manejar preflight requests
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta de salud para Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'CaminoSeguro API is running',
    timestamp: new Date().toISOString()
  });
});

// Ruta principal
app.get('/', (req, res) => {
  res.json({
    name: 'CaminoSeguro API',
    version: '1.0.0',
    description: 'API para la aplicación de seguridad vial CaminoSeguro',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      reports: '/api/reports',
      helpPoints: '/api/help-points',
      routes: '/api/routes',
      alerts: '/api/alerts',
      heatmap: '/api/heatmap',
      stats: '/api/stats'
    }
  });
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/help-points', helpPointRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/heatmap', heatmapRoutes);
app.use('/api/stats', statsRoutes);

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Inicializar base de datos y servidor
const startServer = async () => {
  try {
    await initDatabase();
    console.log('✅ Base de datos conectada e inicializada');
    
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
      console.log(`📍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

startServer();
