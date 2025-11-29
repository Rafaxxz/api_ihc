const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { verifyToken, isAuthority, optionalAuth } = require('../middleware/auth.middleware');

// GET /api/help-points - Obtener puntos de ayuda
router.get('/', async (req, res) => {
  try {
    const { 
      type, 
      lat, 
      lng, 
      radius = 10, // km
      is24h,
      limit = 50,
      offset = 0
    } = req.query;

    let whereClause = 'WHERE is_active = true';
    const values = [];
    let paramIndex = 1;

    if (type) {
      whereClause += ` AND type = $${paramIndex++}`;
      values.push(type);
    }

    if (is24h === 'true') {
      whereClause += ' AND is_24h = true';
    }

    // Filtrar por ubicación
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

    let orderClause = 'ORDER BY name';
    if (lat && lng) {
      orderClause = `ORDER BY (
        6371 * acos(
          cos(radians(${parseFloat(lat)})) * cos(radians(latitude)) * 
          cos(radians(longitude) - radians(${parseFloat(lng)})) + 
          sin(radians(${parseFloat(lat)})) * sin(radians(latitude))
        )
      )`;
    }

    const result = await query(
      `SELECT uuid, name, type, description, latitude, longitude, address, 
              phone, schedule, is_24h
       FROM help_points
       ${whereClause}
       ${orderClause}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    );

    res.json({
      success: true,
      data: {
        helpPoints: result.rows.map(hp => ({
          uuid: hp.uuid,
          name: hp.name,
          type: hp.type,
          description: hp.description,
          location: {
            latitude: parseFloat(hp.latitude),
            longitude: parseFloat(hp.longitude),
            address: hp.address
          },
          phone: hp.phone,
          schedule: hp.schedule,
          is24h: hp.is_24h
        }))
      }
    });
  } catch (error) {
    console.error('Error al obtener puntos de ayuda:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener puntos de ayuda'
    });
  }
});

// GET /api/help-points/types - Obtener tipos de puntos de ayuda
router.get('/types', async (req, res) => {
  res.json({
    success: true,
    data: {
      types: [
        { id: 'police_station', name: 'Comisaría', icon: 'shield' },
        { id: 'hospital', name: 'Hospital', icon: 'hospital' },
        { id: 'fire_station', name: 'Estación de Bomberos', icon: 'fire' },
        { id: 'serenazgo', name: 'Centro de Serenazgo', icon: 'security' },
        { id: 'security_camera', name: 'Cámara de Seguridad', icon: 'camera' },
        { id: 'emergency_point', name: 'Punto de Emergencia', icon: 'emergency' }
      ]
    }
  });
});

// GET /api/help-points/:uuid - Obtener un punto de ayuda específico
router.get('/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;

    const result = await query(
      `SELECT uuid, name, type, description, latitude, longitude, address, 
              phone, schedule, is_24h, created_at
       FROM help_points
       WHERE uuid = $1 AND is_active = true`,
      [uuid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Punto de ayuda no encontrado'
      });
    }

    const hp = result.rows[0];

    res.json({
      success: true,
      data: {
        uuid: hp.uuid,
        name: hp.name,
        type: hp.type,
        description: hp.description,
        location: {
          latitude: parseFloat(hp.latitude),
          longitude: parseFloat(hp.longitude),
          address: hp.address
        },
        phone: hp.phone,
        schedule: hp.schedule,
        is24h: hp.is_24h,
        createdAt: hp.created_at
      }
    });
  } catch (error) {
    console.error('Error al obtener punto de ayuda:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener punto de ayuda'
    });
  }
});

// POST /api/help-points - Crear punto de ayuda (solo autoridades)
router.post('/', verifyToken, isAuthority, [
  body('name').trim().notEmpty().withMessage('Nombre requerido'),
  body('type').isIn(['police_station', 'hospital', 'fire_station', 'serenazgo', 'security_camera', 'emergency_point'])
    .withMessage('Tipo inválido'),
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitud inválida'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitud inválida')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { name, type, description, latitude, longitude, address, phone, schedule, is24h = false } = req.body;

    const helpPointUuid = uuidv4();

    const result = await query(
      `INSERT INTO help_points (uuid, name, type, description, latitude, longitude, address, phone, schedule, is_24h)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING uuid, name, type, latitude, longitude, address, created_at`,
      [helpPointUuid, name, type, description || null, latitude, longitude, address || null, phone || null, schedule || null, is24h]
    );

    res.status(201).json({
      success: true,
      message: 'Punto de ayuda creado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al crear punto de ayuda:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear punto de ayuda'
    });
  }
});

// PUT /api/help-points/:uuid - Actualizar punto de ayuda (solo autoridades)
router.put('/:uuid', verifyToken, isAuthority, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { name, type, description, latitude, longitude, address, phone, schedule, is24h } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name) { updates.push(`name = $${paramIndex++}`); values.push(name); }
    if (type) { updates.push(`type = $${paramIndex++}`); values.push(type); }
    if (description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(description); }
    if (latitude) { updates.push(`latitude = $${paramIndex++}`); values.push(latitude); }
    if (longitude) { updates.push(`longitude = $${paramIndex++}`); values.push(longitude); }
    if (address !== undefined) { updates.push(`address = $${paramIndex++}`); values.push(address); }
    if (phone !== undefined) { updates.push(`phone = $${paramIndex++}`); values.push(phone); }
    if (schedule !== undefined) { updates.push(`schedule = $${paramIndex++}`); values.push(schedule); }
    if (is24h !== undefined) { updates.push(`is_24h = $${paramIndex++}`); values.push(is24h); }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay datos para actualizar'
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(uuid);

    const result = await query(
      `UPDATE help_points SET ${updates.join(', ')} WHERE uuid = $${paramIndex}
       RETURNING uuid, name, type, latitude, longitude, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Punto de ayuda no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Punto de ayuda actualizado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar punto de ayuda:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar punto de ayuda'
    });
  }
});

// DELETE /api/help-points/:uuid - Eliminar punto de ayuda (solo autoridades)
router.delete('/:uuid', verifyToken, isAuthority, async (req, res) => {
  try {
    const { uuid } = req.params;

    const result = await query(
      'UPDATE help_points SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE uuid = $1 RETURNING uuid',
      [uuid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Punto de ayuda no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Punto de ayuda eliminado'
    });
  } catch (error) {
    console.error('Error al eliminar punto de ayuda:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar punto de ayuda'
    });
  }
});

module.exports = router;
