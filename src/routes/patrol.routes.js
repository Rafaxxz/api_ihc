const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { verifyToken, isAuthority } = require('../middleware/auth.middleware');

// Validaciones para crear patrullaje
const patrolValidation = [
  body('name').trim().notEmpty().withMessage('Nombre del patrullaje requerido'),
  body('patrolType').trim().notEmpty().withMessage('Tipo de patrullaje requerido'),
  body('resources').isArray({ min: 1 }).withMessage('Al menos un recurso requerido'),
  body('scheduledAt').isISO8601().withMessage('Fecha y hora inválida'),
  body('duration').isInt({ min: 1, max: 12 }).withMessage('Duración debe ser entre 1 y 12 horas')
];

// GET /api/patrols - Obtener todos los patrullajes
router.get('/', verifyToken, isAuthority, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let whereClause = 'WHERE 1=1';
    const values = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      values.push(status);
    }

    values.push(parseInt(limit), parseInt(offset));

    const result = await query(
      `SELECT p.*, u.full_name as created_by_name
       FROM patrols p
       LEFT JOIN users u ON p.created_by = u.id
       ${whereClause}
       ORDER BY p.scheduled_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    );

    res.json({
      success: true,
      data: {
        patrols: result.rows.map(p => ({
          id: p.id,
          uuid: p.uuid,
          name: p.name,
          patrolType: p.patrol_type,
          resources: p.resources,
          scheduledAt: p.scheduled_at,
          duration: p.duration,
          status: p.status,
          latitude: p.latitude,
          longitude: p.longitude,
          notes: p.notes,
          createdBy: p.created_by_name,
          createdAt: p.created_at,
          updatedAt: p.updated_at
        }))
      }
    });
  } catch (error) {
    console.error('Error al obtener patrullajes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener patrullajes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/patrols/:uuid - Obtener un patrullaje específico
router.get('/:uuid', verifyToken, isAuthority, async (req, res) => {
  try {
    const { uuid } = req.params;

    const result = await query(
      `SELECT p.*, u.full_name as created_by_name
       FROM patrols p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.uuid = $1`,
      [uuid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Patrullaje no encontrado'
      });
    }

    const p = result.rows[0];
    res.json({
      success: true,
      data: {
        id: p.id,
        uuid: p.uuid,
        name: p.name,
        patrolType: p.patrol_type,
        resources: p.resources,
        scheduledAt: p.scheduled_at,
        duration: p.duration,
        status: p.status,
        latitude: p.latitude,
        longitude: p.longitude,
        notes: p.notes,
        createdBy: p.created_by_name,
        createdAt: p.created_at,
        updatedAt: p.updated_at
      }
    });
  } catch (error) {
    console.error('Error al obtener patrullaje:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener patrullaje'
    });
  }
});

// POST /api/patrols - Crear nuevo patrullaje
router.post('/', verifyToken, isAuthority, patrolValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Error de validación',
        errors: errors.array()
      });
    }

    const { name, patrolType, resources, scheduledAt, duration, latitude, longitude, notes } = req.body;
    const uuid = uuidv4();

    const result = await query(
      `INSERT INTO patrols (uuid, name, patrol_type, resources, scheduled_at, duration, status, latitude, longitude, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, $8, $9, $10)
       RETURNING *`,
      [uuid, name, patrolType, JSON.stringify(resources), scheduledAt, duration, latitude || null, longitude || null, notes || null, req.user.id]
    );

    const p = result.rows[0];
    res.status(201).json({
      success: true,
      message: 'Patrullaje creado exitosamente',
      data: {
        uuid: p.uuid,
        name: p.name,
        patrolType: p.patrol_type,
        resources: p.resources,
        scheduledAt: p.scheduled_at,
        duration: p.duration,
        status: p.status,
        latitude: p.latitude,
        longitude: p.longitude
      }
    });
  } catch (error) {
    console.error('Error al crear patrullaje:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear patrullaje',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PATCH /api/patrols/:uuid/status - Actualizar estado del patrullaje
router.patch('/:uuid/status', verifyToken, isAuthority, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { status } = req.body;

    // Validar estados permitidos
    const validStatuses = ['scheduled', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido. Estados permitidos: ' + validStatuses.join(', ')
      });
    }

    const result = await query(
      `UPDATE patrols 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE uuid = $2
       RETURNING *`,
      [status, uuid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Patrullaje no encontrado'
      });
    }

    const p = result.rows[0];
    res.json({
      success: true,
      message: `Patrullaje actualizado a ${status}`,
      data: {
        uuid: p.uuid,
        name: p.name,
        status: p.status,
        updatedAt: p.updated_at
      }
    });
  } catch (error) {
    console.error('Error al actualizar estado:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar estado del patrullaje'
    });
  }
});

// PUT /api/patrols/:uuid - Actualizar patrullaje completo
router.put('/:uuid', verifyToken, isAuthority, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { name, patrolType, resources, scheduledAt, duration, latitude, longitude, notes } = req.body;

    const result = await query(
      `UPDATE patrols 
       SET name = COALESCE($1, name),
           patrol_type = COALESCE($2, patrol_type),
           resources = COALESCE($3, resources),
           scheduled_at = COALESCE($4, scheduled_at),
           duration = COALESCE($5, duration),
           latitude = COALESCE($6, latitude),
           longitude = COALESCE($7, longitude),
           notes = COALESCE($8, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE uuid = $9
       RETURNING *`,
      [name, patrolType, resources ? JSON.stringify(resources) : null, scheduledAt, duration, latitude, longitude, notes, uuid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Patrullaje no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Patrullaje actualizado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar patrullaje:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar patrullaje'
    });
  }
});

// DELETE /api/patrols/:uuid - Eliminar patrullaje
router.delete('/:uuid', verifyToken, isAuthority, async (req, res) => {
  try {
    const { uuid } = req.params;

    const result = await query(
      'DELETE FROM patrols WHERE uuid = $1 RETURNING uuid, name',
      [uuid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Patrullaje no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Patrullaje eliminado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al eliminar patrullaje:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar patrullaje'
    });
  }
});

module.exports = router;
