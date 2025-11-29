const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

// GET /api/heatmap - Obtener datos para mapa de calor
router.get('/', async (req, res) => {
  try {
    const { 
      zoneType,
      lat,
      lng,
      radius = 20, // km
      minIntensity = 1
    } = req.query;

    let whereClause = 'WHERE intensity >= $1';
    const values = [parseInt(minIntensity)];
    let paramIndex = 2;

    if (zoneType) {
      whereClause += ` AND zone_type = $${paramIndex++}`;
      values.push(zoneType);
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
    }

    const result = await query(
      `SELECT uuid, latitude, longitude, intensity, zone_type, 
              incident_count, last_incident_at
       FROM heat_zones
       ${whereClause}
       ORDER BY intensity DESC`,
      values
    );

    res.json({
      success: true,
      data: {
        zones: result.rows.map(z => ({
          uuid: z.uuid,
          latitude: parseFloat(z.latitude),
          longitude: parseFloat(z.longitude),
          intensity: z.intensity,
          type: z.zone_type,
          incidentCount: z.incident_count,
          lastIncidentAt: z.last_incident_at
        }))
      }
    });
  } catch (error) {
    console.error('Error al obtener datos de mapa de calor:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener datos de mapa de calor'
    });
  }
});

// GET /api/heatmap/types - Obtener tipos de zonas
router.get('/types', async (req, res) => {
  res.json({
    success: true,
    data: {
      types: [
        { id: 'crime', name: 'Zonas de criminalidad', color: '#ff0000' },
        { id: 'accident', name: 'Zonas de accidentes', color: '#ff8c00' },
        { id: 'congestion', name: 'Zonas de congestión', color: '#ffd700' },
        { id: 'danger', name: 'Zonas peligrosas', color: '#dc143c' }
      ]
    }
  });
});

// GET /api/heatmap/summary - Obtener resumen de zonas
router.get('/summary', async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query;

    let whereClause = '';
    const values = [];

    if (lat && lng) {
      whereClause = `WHERE (
        6371 * acos(
          cos(radians($1)) * cos(radians(latitude)) * 
          cos(radians(longitude) - radians($2)) + 
          sin(radians($1)) * sin(radians(latitude))
        )
      ) <= $3`;
      values.push(parseFloat(lat), parseFloat(lng), parseFloat(radius));
    }

    const result = await query(
      `SELECT zone_type, 
              COUNT(*) as zone_count,
              SUM(incident_count) as total_incidents,
              AVG(intensity) as avg_intensity,
              MAX(intensity) as max_intensity
       FROM heat_zones
       ${whereClause}
       GROUP BY zone_type`,
      values
    );

    const summary = {};
    result.rows.forEach(row => {
      summary[row.zone_type] = {
        zoneCount: parseInt(row.zone_count),
        totalIncidents: parseInt(row.total_incidents),
        avgIntensity: parseFloat(row.avg_intensity).toFixed(1),
        maxIntensity: parseInt(row.max_intensity)
      };
    });

    res.json({
      success: true,
      data: { summary }
    });
  } catch (error) {
    console.error('Error al obtener resumen:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener resumen'
    });
  }
});

// GET /api/heatmap/high-risk - Obtener zonas de alto riesgo
router.get('/high-risk', async (req, res) => {
  try {
    const { limit = 10, lat, lng, radius = 50 } = req.query;

    let whereClause = 'WHERE intensity >= 7';
    const values = [parseInt(limit)];
    let paramIndex = 2;

    if (lat && lng) {
      whereClause += ` AND (
        6371 * acos(
          cos(radians($${paramIndex})) * cos(radians(latitude)) * 
          cos(radians(longitude) - radians($${paramIndex + 1})) + 
          sin(radians($${paramIndex})) * sin(radians(latitude))
        )
      ) <= $${paramIndex + 2}`;
      values.push(parseFloat(lat), parseFloat(lng), parseFloat(radius));
    }

    const result = await query(
      `SELECT uuid, latitude, longitude, intensity, zone_type, 
              incident_count, last_incident_at
       FROM heat_zones
       ${whereClause}
       ORDER BY intensity DESC, incident_count DESC
       LIMIT $1`,
      values
    );

    res.json({
      success: true,
      data: {
        highRiskZones: result.rows.map(z => ({
          uuid: z.uuid,
          latitude: parseFloat(z.latitude),
          longitude: parseFloat(z.longitude),
          intensity: z.intensity,
          type: z.zone_type,
          incidentCount: z.incident_count,
          lastIncidentAt: z.last_incident_at
        }))
      }
    });
  } catch (error) {
    console.error('Error al obtener zonas de alto riesgo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener zonas de alto riesgo'
    });
  }
});

module.exports = router;
