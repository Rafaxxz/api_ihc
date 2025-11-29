-- Script para insertar datos de ejemplo en la base de datos
-- Ejecutar después de que las tablas estén creadas

-- Insertar puntos de ayuda de ejemplo (Lima, Perú)
INSERT INTO help_points (uuid, name, type, description, latitude, longitude, address, phone, schedule, is_24h) VALUES
('hp-001', 'Comisaría de Miraflores', 'police_station', 'Comisaría PNP de Miraflores', -12.1186, -77.0286, 'Av. José Larco 770, Miraflores', '(01) 445-1234', '24 horas', true),
('hp-002', 'Hospital Rebagliati', 'hospital', 'Hospital Nacional Edgardo Rebagliati Martins', -12.0789, -77.0389, 'Av. Edgardo Rebagliati 490, Jesús María', '(01) 265-4901', '24 horas', true),
('hp-003', 'Estación de Bomberos N° 4', 'fire_station', 'Compañía de Bomberos Voluntarios N° 4', -12.1097, -77.0344, 'Calle Berlín 601, Miraflores', '116', '24 horas', true),
('hp-004', 'Serenazgo San Isidro', 'serenazgo', 'Central de Serenazgo de San Isidro', -12.0986, -77.0352, 'Calle Libertadores 130, San Isidro', '(01) 513-9000', '24 horas', true),
('hp-005', 'Comisaría San Borja', 'police_station', 'Comisaría PNP de San Borja', -12.1019, -76.9989, 'Av. San Borja Norte 1130, San Borja', '(01) 476-2345', '24 horas', true),
('hp-006', 'Clínica Ricardo Palma', 'hospital', 'Clínica Ricardo Palma - Emergencias', -12.0994, -77.0317, 'Av. Javier Prado Este 1066, San Isidro', '(01) 224-2224', '24 horas', true),
('hp-007', 'Serenazgo Miraflores', 'serenazgo', 'Central de Serenazgo de Miraflores', -12.1201, -77.0322, 'Av. Larco cdra. 7, Miraflores', '(01) 617-7000', '24 horas', true),
('hp-008', 'Cámara Parque Kennedy', 'security_camera', 'Cámara de vigilancia Parque Kennedy', -12.1197, -77.0300, 'Parque Kennedy, Miraflores', NULL, '24/7', true),
('hp-009', 'Punto de Emergencia Larcomar', 'emergency_point', 'Punto de auxilio rápido en Larcomar', -12.1307, -77.0296, 'Centro Comercial Larcomar', '(01) 620-6000', '10:00 - 22:00', false),
('hp-010', 'Hospital Militar Central', 'hospital', 'Hospital Militar Central', -12.0812, -77.0049, 'Av. Faustino Sánchez Carrión s/n, Jesús María', '(01) 463-2222', '24 horas', true);

-- Insertar zonas de calor de ejemplo
INSERT INTO heat_zones (uuid, latitude, longitude, intensity, zone_type, incident_count) VALUES
('hz-001', -12.0464, -77.0428, 7, 'crime', 15),
('hz-002', -12.0556, -77.0864, 5, 'accident', 8),
('hz-003', -12.1186, -77.0286, 3, 'congestion', 12),
('hz-004', -12.0789, -77.0389, 6, 'danger', 10),
('hz-005', -12.0986, -77.0352, 4, 'crime', 6),
('hz-006', -12.1097, -77.0344, 8, 'accident', 20),
('hz-007', -12.0812, -77.0049, 2, 'congestion', 5),
('hz-008', -12.1019, -76.9989, 5, 'crime', 9);

-- Insertar alertas de ejemplo
INSERT INTO alerts (uuid, title, message, alert_type, severity, latitude, longitude, radius_km, is_active) VALUES
('al-001', 'Accidente en Av. Javier Prado', 'Se reporta accidente vehicular múltiple en Av. Javier Prado con Av. Arequipa. Evite la zona.', 'accident', 'high', -12.0900, -77.0350, 0.5, true),
('al-002', 'Congestión en Vía Expresa', 'Alto tráfico vehicular en la Vía Expresa sentido sur. Tiempo estimado de demora: 45 minutos.', 'congestion', 'medium', -12.1100, -77.0300, 2, true),
('al-003', 'Zona de obras en San Isidro', 'Obras en Av. Camino Real. Carril derecho cerrado hasta las 18:00.', 'obstruction', 'low', -12.0980, -77.0400, 0.3, true),
('al-004', 'Alerta de seguridad nocturna', 'Se recomienda precaución en la zona de La Victoria durante horario nocturno.', 'danger_zone', 'high', -12.0650, -77.0200, 1, true),
('al-005', 'Evento deportivo en Estadio Nacional', 'Partido de fútbol hoy a las 20:00. Se esperan cierres viales en las inmediaciones.', 'event', 'medium', -12.0669, -77.0330, 1, true);

SELECT 'Datos de ejemplo insertados correctamente' as mensaje;
