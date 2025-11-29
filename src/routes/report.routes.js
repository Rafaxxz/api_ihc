const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { verifyToken, optionalAuth, isAuthority } = require('../middleware/auth.middleware');

// Validaciones para crear reporte
const reportValidation = [
  body('incidentType').trim().notEmpty().withMessage('Tipo de incidente requerido'),
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitud inválida'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitud inválida')
];

// GET /api/reports - Obtener reportes
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { 
      limit = 20, 
      offset = 0, 
      status, 
      incidentType, 
      severity,
      lat, 
      lng, 
      radius = 5 // km
    } = req.query;

    let whereClause = 'WHERE 1=1';
    const values = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      values.push(status);
    }

    if (incidentType) {
      whereClause += ` AND incident_type = $${paramIndex++}`;
      values.push(incidentType);
    }

    if (severity) {
      whereClause += ` AND severity = $${paramIndex++}`;
      values.push(severity);
    }

    // Filtrar por ubicación (radio en km)
    if (lat && lng) {
      whereClause += ` AND (
        6371 * acos(
          cos(radians($${paramIndex})) * cos(radians(latitude)) * 
          cos(radians(longitude) - radians($${paramIndex + 1})) + 
          sin(radians($${paramIndex})) * sin(radians(latitude))
        )
      ) <= $${paramIndex + 2}`;
      values.push(parseFloat(lat), parseFloat(lng), parseFloat(radius));
      paramIndex += 3;
    }

    values.push(parseInt(limit), parseInt(offset));

    const result = await query(
      `SELECT r.uuid, r.incident_type, r.description, r.latitude, r.longitude, 
              r.address, r.severity, r.status, r.image_url, r.is_anonymous,
              r.views_count, r.created_at,
              CASE WHEN r.is_anonymous THEN NULL ELSE u.full_name END as reporter_name
       FROM reports r
       LEFT JOIN users u ON r.user_id = u.id
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    );

    res.json({
      success: true,
      data: {
        reports: result.rows.map(r => ({
          uuid: r.uuid,
          incidentType: r.incident_type,
          description: r.description,
          location: {
            latitude: parseFloat(r.latitude),
            longitude: parseFloat(r.longitude),
            address: r.address
          },
          severity: r.severity,
          status: r.status,
          imageUrl: r.image_url,
          isAnonymous: r.is_anonymous,
          reporterName: r.reporter_name,
          viewsCount: r.views_count,
          createdAt: r.created_at
        }))
      }
    });
  } catch (error) {
    console.error('Error al obtener reportes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener reportes'
    });
  }
});

// GET /api/reports/:uuid - Obtener un reporte específico
router.get('/:uuid', optionalAuth, async (req, res) => {
  try {
    const { uuid } = req.params;

    // Incrementar vistas
    await query('UPDATE reports SET views_count = views_count + 1 WHERE uuid = $1', [uuid]);

    const result = await query(
      `SELECT r.uuid, r.incident_type, r.description, r.latitude, r.longitude, 
              r.address, r.severity, r.status, r.image_url, r.is_anonymous,
              r.views_count, r.created_at, r.updated_at,
              CASE WHEN r.is_anonymous THEN NULL ELSE u.full_name END as reporter_name,
              CASE WHEN r.is_anonymous THEN NULL ELSE u.uuid END as reporter_uuid
       FROM reports r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.uuid = $1`,
      [uuid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reporte no encontrado'
      });
    }

    const r = result.rows[0];

    res.json({
      success: true,
      data: {
        uuid: r.uuid,
        incidentType: r.incident_type,
        description: r.description,
        location: {
          latitude: parseFloat(r.latitude),
          longitude: parseFloat(r.longitude),
          address: r.address
        },
        severity: r.severity,
        status: r.status,
        imageUrl: r.image_url,
        isAnonymous: r.is_anonymous,
        reporterName: r.reporter_name,
        reporterUuid: r.reporter_uuid,
        viewsCount: r.views_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }
    });
  } catch (error) {
    console.error('Error al obtener reporte:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener reporte'
    });
  }
});

// POST /api/reports - Crear un nuevo reporte
router.post('/', verifyToken, reportValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { 
      incidentType, 
      description, 
      latitude, 
      longitude, 
      address, 
      severity = 'medium',
      imageUrl,
      isAnonymous = false 
    } = req.body;

    const reportUuid = uuidv4();

    const result = await query(
      `INSERT INTO reports (uuid, user_id, incident_type, description, latitude, longitude, 
                           address, severity, image_url, is_anonymous)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING uuid, incident_type, description, latitude, longitude, address, 
                 severity, status, created_at`,
      [reportUuid, req.user.id, incidentType, description || null, latitude, longitude, 
       address || null, severity, imageUrl || null, isAnonymous]
    );

    const report = result.rows[0];

    // Actualizar zona de calor
    await updateHeatZone(latitude, longitude, incidentType);

    res.status(201).json({
      success: true,
      message: 'Reporte creado exitosamente',
      data: {
        uuid: report.uuid,
        incidentType: report.incident_type,
        description: report.description,
        location: {
          latitude: parseFloat(report.latitude),
          longitude: parseFloat(report.longitude),
          address: report.address
        },
        severity: report.severity,
        status: report.status,
        createdAt: report.created_at
      }
    });
  } catch (error) {
    console.error('Error al crear reporte:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear reporte'
    });
  }
});

// PUT /api/reports/:uuid/status - Actualizar estado del reporte (solo autoridades)
router.put('/:uuid/status', verifyToken, isAuthority, [
  body('status').isIn(['pending', 'reviewing', 'confirmed', 'resolved', 'rejected'])
    .withMessage('Estado inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { uuid } = req.params;
    const { status } = req.body;

    const result = await query(
      `UPDATE reports SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE uuid = $2
       RETURNING uuid, status, updated_at`,
      [status, uuid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reporte no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Estado del reporte actualizado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar estado:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar estado'
    });
  }
});

// GET /api/reports/my-reports - Obtener reportes del usuario actual
router.get('/user/my-reports', verifyToken, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const result = await query(
      `SELECT uuid, incident_type, description, latitude, longitude, 
              address, severity, status, image_url, views_count, created_at
       FROM reports
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: {
        reports: result.rows.map(r => ({
          uuid: r.uuid,
          incidentType: r.incident_type,
          description: r.description,
          location: {
            latitude: parseFloat(r.latitude),
            longitude: parseFloat(r.longitude),
            address: r.address
          },
          severity: r.severity,
          status: r.status,
          imageUrl: r.image_url,
          viewsCount: r.views_count,
          createdAt: r.created_at
        }))
      }
    });
  } catch (error) {
    console.error('Error al obtener mis reportes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener mis reportes'
    });
  }
});

// Función auxiliar para actualizar zonas de calor
async function updateHeatZone(latitude, longitude, incidentType) {
  try {
    // Determinar tipo de zona según el incidente
    let zoneType = 'danger';
    if (incidentType.toLowerCase().includes('accidente')) zoneType = 'accident';
    else if (incidentType.toLowerCase().includes('robo') || incidentType.toLowerCase().includes('crimen')) zoneType = 'crime';
    else if (incidentType.toLowerCase().includes('congestión') || incidentType.toLowerCase().includes('tráfico')) zoneType = 'congestion';

    // Buscar zona cercana existente (dentro de ~100m)
    const existingZone = await query(
      `SELECT id, incident_count, intensity FROM heat_zones 
       WHERE zone_type = $1 
       AND (
         6371 * acos(
           cos(radians($2)) * cos(radians(latitude)) * 
           cos(radians(longitude) - radians($3)) + 
           sin(radians($2)) * sin(radians(latitude))
         )
       ) <= 0.1`,
      [zoneType, latitude, longitude]
    );

    if (existingZone.rows.length > 0) {
      // Actualizar zona existente
      const zone = existingZone.rows[0];
      const newIntensity = Math.min(10, zone.intensity + 1);
      await query(
        `UPDATE heat_zones 
         SET incident_count = incident_count + 1, 
             intensity = $1,
             last_incident_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [newIntensity, zone.id]
      );
    } else {
      // Crear nueva zona
      await query(
        `INSERT INTO heat_zones (uuid, latitude, longitude, zone_type, intensity)
         VALUES ($1, $2, $3, $4, 1)`,
        [uuidv4(), latitude, longitude, zoneType]
      );
    }
  } catch (error) {
    console.error('Error al actualizar zona de calor:', error);
  }
}

module.exports = router;
