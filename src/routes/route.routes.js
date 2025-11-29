const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { verifyToken, optionalAuth } = require('../middleware/auth.middleware');

// GET /api/routes - Obtener rutas guardadas del usuario
router.get('/', verifyToken, async (req, res) => {
  try {
    const { limit = 20, offset = 0, favoritesOnly = false } = req.query;

    let whereClause = 'WHERE user_id = $1';
    if (favoritesOnly === 'true') {
      whereClause += ' AND is_favorite = true';
    }

    const result = await query(
      `SELECT uuid, name, origin_lat, origin_lng, origin_address,
              destination_lat, destination_lng, destination_address,
              waypoints, safety_score, distance_km, estimated_time_min,
              is_favorite, created_at
       FROM safe_routes
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      data: {
        routes: result.rows.map(r => ({
          uuid: r.uuid,
          name: r.name,
          origin: {
            latitude: parseFloat(r.origin_lat),
            longitude: parseFloat(r.origin_lng),
            address: r.origin_address
          },
          destination: {
            latitude: parseFloat(r.destination_lat),
            longitude: parseFloat(r.destination_lng),
            address: r.destination_address
          },
          waypoints: r.waypoints,
          safetyScore: r.safety_score,
          distanceKm: parseFloat(r.distance_km),
          estimatedTimeMin: r.estimated_time_min,
          isFavorite: r.is_favorite,
          createdAt: r.created_at
        }))
      }
    });
  } catch (error) {
    console.error('Error al obtener rutas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener rutas'
    });
  }
});

// POST /api/routes/calculate - Calcular ruta segura
router.post('/calculate', optionalAuth, [
  body('originLat').isFloat({ min: -90, max: 90 }).withMessage('Latitud de origen inválida'),
  body('originLng').isFloat({ min: -180, max: 180 }).withMessage('Longitud de origen inválida'),
  body('destinationLat').isFloat({ min: -90, max: 90 }).withMessage('Latitud de destino inválida'),
  body('destinationLng').isFloat({ min: -180, max: 180 }).withMessage('Longitud de destino inválida')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { originLat, originLng, originAddress, destinationLat, destinationLng, destinationAddress } = req.body;

    // Calcular score de seguridad basado en zonas de calor cercanas
    const heatZonesInRoute = await query(
      `SELECT zone_type, intensity, incident_count FROM heat_zones
       WHERE (
         6371 * acos(
           cos(radians($1)) * cos(radians(latitude)) * 
           cos(radians(longitude) - radians($2)) + 
           sin(radians($1)) * sin(radians(latitude))
         )
       ) <= 2
       OR (
         6371 * acos(
           cos(radians($3)) * cos(radians(latitude)) * 
           cos(radians(longitude) - radians($4)) + 
           sin(radians($3)) * sin(radians(latitude))
         )
       ) <= 2`,
      [originLat, originLng, destinationLat, destinationLng]
    );

    // Calcular score de seguridad (100 = muy seguro, 0 = muy peligroso)
    let safetyScore = 100;
    heatZonesInRoute.rows.forEach(zone => {
      safetyScore -= zone.intensity * 2;
    });
    safetyScore = Math.max(0, Math.min(100, safetyScore));

    // Calcular distancia aproximada (fórmula de Haversine)
    const R = 6371; // Radio de la Tierra en km
    const dLat = (destinationLat - originLat) * Math.PI / 180;
    const dLng = (destinationLng - originLng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(originLat * Math.PI / 180) * Math.cos(destinationLat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    // Estimar tiempo (asumiendo 30 km/h promedio en ciudad)
    const estimatedTime = Math.round((distance / 30) * 60);

    // Obtener puntos de ayuda cercanos a la ruta
    const helpPointsNearby = await query(
      `SELECT uuid, name, type, latitude, longitude, phone FROM help_points
       WHERE is_active = true
       AND (
         (6371 * acos(
           cos(radians($1)) * cos(radians(latitude)) * 
           cos(radians(longitude) - radians($2)) + 
           sin(radians($1)) * sin(radians(latitude))
         )) <= 1
         OR
         (6371 * acos(
           cos(radians($3)) * cos(radians(latitude)) * 
           cos(radians(longitude) - radians($4)) + 
           sin(radians($3)) * sin(radians(latitude))
         )) <= 1
       )
       LIMIT 10`,
      [originLat, originLng, destinationLat, destinationLng]
    );

    res.json({
      success: true,
      data: {
        route: {
          origin: {
            latitude: parseFloat(originLat),
            longitude: parseFloat(originLng),
            address: originAddress
          },
          destination: {
            latitude: parseFloat(destinationLat),
            longitude: parseFloat(destinationLng),
            address: destinationAddress
          },
          safetyScore,
          safetyLevel: safetyScore >= 80 ? 'high' : safetyScore >= 50 ? 'medium' : 'low',
          distanceKm: parseFloat(distance.toFixed(2)),
          estimatedTimeMin: estimatedTime,
          dangerZones: heatZonesInRoute.rows.length,
          helpPointsNearby: helpPointsNearby.rows.map(hp => ({
            uuid: hp.uuid,
            name: hp.name,
            type: hp.type,
            latitude: parseFloat(hp.latitude),
            longitude: parseFloat(hp.longitude),
            phone: hp.phone
          }))
        }
      }
    });
  } catch (error) {
    console.error('Error al calcular ruta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al calcular ruta'
    });
  }
});

// POST /api/routes - Guardar una ruta
router.post('/', verifyToken, [
  body('originLat').isFloat({ min: -90, max: 90 }).withMessage('Latitud de origen inválida'),
  body('originLng').isFloat({ min: -180, max: 180 }).withMessage('Longitud de origen inválida'),
  body('destinationLat').isFloat({ min: -90, max: 90 }).withMessage('Latitud de destino inválida'),
  body('destinationLng').isFloat({ min: -180, max: 180 }).withMessage('Longitud de destino inválida')
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
      name, 
      originLat, originLng, originAddress,
      destinationLat, destinationLng, destinationAddress,
      waypoints, safetyScore, distanceKm, estimatedTimeMin,
      isFavorite = false 
    } = req.body;

    const routeUuid = uuidv4();

    const result = await query(
      `INSERT INTO safe_routes (uuid, user_id, name, origin_lat, origin_lng, origin_address,
                               destination_lat, destination_lng, destination_address,
                               waypoints, safety_score, distance_km, estimated_time_min, is_favorite)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING uuid, name, safety_score, is_favorite, created_at`,
      [routeUuid, req.user.id, name || null, originLat, originLng, originAddress || null,
       destinationLat, destinationLng, destinationAddress || null,
       waypoints ? JSON.stringify(waypoints) : null, safetyScore || 0, distanceKm || null, estimatedTimeMin || null, isFavorite]
    );

    res.status(201).json({
      success: true,
      message: 'Ruta guardada exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al guardar ruta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al guardar ruta'
    });
  }
});

// PUT /api/routes/:uuid/favorite - Marcar/desmarcar ruta como favorita
router.put('/:uuid/favorite', verifyToken, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { isFavorite } = req.body;

    const result = await query(
      `UPDATE safe_routes SET is_favorite = $1 
       WHERE uuid = $2 AND user_id = $3
       RETURNING uuid, is_favorite`,
      [isFavorite, uuid, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ruta no encontrada'
      });
    }

    res.json({
      success: true,
      message: isFavorite ? 'Ruta marcada como favorita' : 'Ruta desmarcada de favoritos',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar favorito:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar favorito'
    });
  }
});

// DELETE /api/routes/:uuid - Eliminar ruta guardada
router.delete('/:uuid', verifyToken, async (req, res) => {
  try {
    const { uuid } = req.params;

    const result = await query(
      'DELETE FROM safe_routes WHERE uuid = $1 AND user_id = $2 RETURNING uuid',
      [uuid, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ruta no encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Ruta eliminada'
    });
  } catch (error) {
    console.error('Error al eliminar ruta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar ruta'
    });
  }
});

module.exports = router;
