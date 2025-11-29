const { Pool } = require('pg');

// Configuración de la conexión a PostgreSQL
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  max: 10
};

// Para desarrollo local sin base de datos, usar modo mock
const useMockDatabase = process.env.USE_MOCK_DB === 'true';

let pool;
if (!useMockDatabase) {
  pool = new Pool(poolConfig);
}

// Función para ejecutar queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Query ejecutada', { text: text.substring(0, 50), duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Error en query:', error);
    throw error;
  }
};

// Inicializar tablas de la base de datos
const initDatabase = async () => {
  try {
    // Tabla de usuarios
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        uuid VARCHAR(36) UNIQUE NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        avatar_url TEXT,
        user_type VARCHAR(20) DEFAULT 'citizen' CHECK (user_type IN ('citizen', 'authority', 'admin')),
        institution VARCHAR(255),
        badge_number VARCHAR(50),
        is_verified BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de reportes/incidentes
    await query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        uuid VARCHAR(36) UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id),
        incident_type VARCHAR(100) NOT NULL,
        description TEXT,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        address TEXT,
        severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'confirmed', 'resolved', 'rejected')),
        image_url TEXT,
        is_anonymous BOOLEAN DEFAULT FALSE,
        views_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de puntos de ayuda
    await query(`
      CREATE TABLE IF NOT EXISTS help_points (
        id SERIAL PRIMARY KEY,
        uuid VARCHAR(36) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN ('police_station', 'hospital', 'fire_station', 'serenazgo', 'security_camera', 'emergency_point')),
        description TEXT,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        address TEXT,
        phone VARCHAR(50),
        schedule VARCHAR(255),
        is_24h BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de rutas seguras
    await query(`
      CREATE TABLE IF NOT EXISTS safe_routes (
        id SERIAL PRIMARY KEY,
        uuid VARCHAR(36) UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id),
        name VARCHAR(255),
        origin_lat DECIMAL(10, 8) NOT NULL,
        origin_lng DECIMAL(11, 8) NOT NULL,
        origin_address TEXT,
        destination_lat DECIMAL(10, 8) NOT NULL,
        destination_lng DECIMAL(11, 8) NOT NULL,
        destination_address TEXT,
        waypoints JSONB,
        safety_score INTEGER DEFAULT 0 CHECK (safety_score >= 0 AND safety_score <= 100),
        distance_km DECIMAL(10, 2),
        estimated_time_min INTEGER,
        is_favorite BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de alertas
    await query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        uuid VARCHAR(36) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('accident', 'congestion', 'obstruction', 'danger_zone', 'weather', 'event', 'general')),
        severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        radius_km DECIMAL(5, 2),
        is_active BOOLEAN DEFAULT TRUE,
        expires_at TIMESTAMP,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de zonas de calor (para mapas de calor)
    await query(`
      CREATE TABLE IF NOT EXISTS heat_zones (
        id SERIAL PRIMARY KEY,
        uuid VARCHAR(36) UNIQUE NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        intensity INTEGER DEFAULT 1 CHECK (intensity >= 1 AND intensity <= 10),
        zone_type VARCHAR(50) NOT NULL CHECK (zone_type IN ('crime', 'accident', 'congestion', 'danger')),
        last_incident_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        incident_count INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de notificaciones
    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        uuid VARCHAR(36) UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id),
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        notification_type VARCHAR(50) DEFAULT 'info',
        is_read BOOLEAN DEFAULT FALSE,
        related_entity_type VARCHAR(50),
        related_entity_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Índices para mejorar el rendimiento
    await query(`CREATE INDEX IF NOT EXISTS idx_reports_location ON reports(latitude, longitude)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_help_points_location ON help_points(latitude, longitude)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_help_points_type ON help_points(type)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(is_active)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_heat_zones_location ON heat_zones(latitude, longitude)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)`);

    console.log('✅ Tablas de la base de datos inicializadas correctamente');
  } catch (error) {
    console.error('❌ Error al inicializar la base de datos:', error);
    throw error;
  }
};

module.exports = {
  query,
  pool,
  initDatabase
};
