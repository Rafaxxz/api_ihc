const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { verifyToken, isAuthority, optionalAuth } = require('../middleware/auth.middleware');

// GET /api/alerts - Obtener alertas activas
router.get('/', async (req, res) => {
  try {
    const { 
      lat, 
      lng, 
      radius = 10, // km
      type,
      severity,
      limit = 20,
      offset = 0
    } = req.query;

    let whereClause = 'WHERE is_active = true AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)';
    const values = [];
    let paramIndex = 1;

    if (type) {
      whereClause += ` AND alert_type = $${paramIndex++}`;
      values.push(type);
    }

    if (severity) {
      whereClause += ` AND severity = $${paramIndex++}`;
      values.push(severity);
    }

    // Filtrar por ubicación
    if (lat && lng) {
      whereClause += ` AND (
        latitude IS NULL OR
        (6371 * acos(
          cos(radians($${paramIndex})) * cos(radians(latitude)) * 
          cos(radians(longitude) - radians($${paramIndex + 1})) + 
          sin(radians($${paramIndex})) * sin(radians(latitude))
        )) <= $${paramIndex + 2}
      )`;
      values.push(parseFloat(lat), parseFloat(lng), parseFloat(radius));
      paramIndex += 3;
    }

    values.push(parseInt(limit), parseInt(offset));

    const result = await query(
      `SELECT a.uuid, a.title, a.message, a.alert_type, a.severity,
              a.latitude, a.longitude, a.radius_km, a.expires_at, a.created_at,
              u.full_name as created_by_name
       FROM alerts a
       LEFT JOIN users u ON a.created_by = u.id
       ${whereClause}
       ORDER BY 
         CASE a.severity 
           WHEN 'critical' THEN 1 
           WHEN 'high' THEN 2 
           WHEN 'medium' THEN 3 
           ELSE 4 
         END,
         a.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    );

    res.json({
      success: true,
      data: {
        alerts: result.rows.map(a => ({
          uuid: a.uuid,
          title: a.title,
          message: a.message,
          type: a.alert_type,
          severity: a.severity,
          location: a.latitude ? {
            latitude: parseFloat(a.latitude),
            longitude: parseFloat(a.longitude),
            radiusKm: a.radius_km ? parseFloat(a.radius_km) : null
          } : null,
          expiresAt: a.expires_at,
          createdAt: a.created_at,
          createdBy: a.created_by_name
        }))
      }
    });
  } catch (error) {
    console.error('Error al obtener alertas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener alertas'
    });
  }
});

// GET /api/alerts/types - Obtener tipos de alertas
router.get('/types', async (req, res) => {
  res.json({
    success: true,
    data: {
      types: [
        { id: 'accident', name: 'Accidente de tráfico', icon: 'car-crash' },
        { id: 'congestion', name: 'Congestión vehicular', icon: 'traffic-cone' },
        { id: 'obstruction', name: 'Obstrucción en la vía', icon: 'warning' },
        { id: 'danger_zone', name: 'Zona peligrosa', icon: 'alert-triangle' },
        { id: 'weather', name: 'Condición climática', icon: 'cloud-rain' },
        { id: 'event', name: 'Evento especial', icon: 'calendar' },
        { id: 'general', name: 'Alerta general', icon: 'bell' }
      ]
    }
  });
});

// GET /api/alerts/:uuid - Obtener una alerta específica
router.get('/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;

    const result = await query(
      `SELECT a.uuid, a.title, a.message, a.alert_type, a.severity,
              a.latitude, a.longitude, a.radius_km, a.is_active, a.expires_at, 
              a.created_at, u.full_name as created_by_name
       FROM alerts a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.uuid = $1`,
      [uuid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alerta no encontrada'
      });
    }

    const a = result.rows[0];

    res.json({
      success: true,
      data: {
        uuid: a.uuid,
        title: a.title,
        message: a.message,
        type: a.alert_type,
        severity: a.severity,
        location: a.latitude ? {
          latitude: parseFloat(a.latitude),
          longitude: parseFloat(a.longitude),
          radiusKm: a.radius_km ? parseFloat(a.radius_km) : null
        } : null,
        isActive: a.is_active,
        expiresAt: a.expires_at,
        createdAt: a.created_at,
        createdBy: a.created_by_name
      }
    });
  } catch (error) {
    console.error('Error al obtener alerta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener alerta'
    });
  }
});

// POST /api/alerts - Crear alerta (solo autoridades)
router.post('/', verifyToken, isAuthority, [
  body('title').trim().notEmpty().withMessage('Título requerido'),
  body('message').trim().notEmpty().withMessage('Mensaje requerido'),
  body('alertType').isIn(['accident', 'congestion', 'obstruction', 'danger_zone', 'weather', 'event', 'general'])
    .withMessage('Tipo de alerta inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { 
      title, message, alertType, severity = 'medium',
      latitude, longitude, radiusKm, expiresAt 
    } = req.body;

    const alertUuid = uuidv4();

    const result = await query(
      `INSERT INTO alerts (uuid, title, message, alert_type, severity, latitude, longitude, radius_km, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING uuid, title, alert_type, severity, created_at`,
      [alertUuid, title, message, alertType, severity, 
       latitude || null, longitude || null, radiusKm || null, expiresAt || null, req.user.id]
    );

    res.status(201).json({
      success: true,
      message: 'Alerta creada exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al crear alerta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear alerta'
    });
  }
});

// PUT /api/alerts/:uuid - Actualizar alerta (solo autoridades)
router.put('/:uuid', verifyToken, isAuthority, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { title, message, alertType, severity, latitude, longitude, radiusKm, expiresAt, isActive } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (title) { updates.push(`title = $${paramIndex++}`); values.push(title); }
    if (message) { updates.push(`message = $${paramIndex++}`); values.push(message); }
    if (alertType) { updates.push(`alert_type = $${paramIndex++}`); values.push(alertType); }
    if (severity) { updates.push(`severity = $${paramIndex++}`); values.push(severity); }
    if (latitude !== undefined) { updates.push(`latitude = $${paramIndex++}`); values.push(latitude); }
    if (longitude !== undefined) { updates.push(`longitude = $${paramIndex++}`); values.push(longitude); }
    if (radiusKm !== undefined) { updates.push(`radius_km = $${paramIndex++}`); values.push(radiusKm); }
    if (expiresAt !== undefined) { updates.push(`expires_at = $${paramIndex++}`); values.push(expiresAt); }
    if (isActive !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(isActive); }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay datos para actualizar'
      });
    }

    values.push(uuid);

    const result = await query(
      `UPDATE alerts SET ${updates.join(', ')} WHERE uuid = $${paramIndex}
       RETURNING uuid, title, alert_type, is_active`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alerta no encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Alerta actualizada',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar alerta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar alerta'
    });
  }
});

// DELETE /api/alerts/:uuid - Desactivar alerta (solo autoridades)
router.delete('/:uuid', verifyToken, isAuthority, async (req, res) => {
  try {
    const { uuid } = req.params;

    const result = await query(
      'UPDATE alerts SET is_active = false WHERE uuid = $1 RETURNING uuid',
      [uuid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alerta no encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Alerta desactivada'
    });
  } catch (error) {
    console.error('Error al desactivar alerta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al desactivar alerta'
    });
  }
});

module.exports = router;
