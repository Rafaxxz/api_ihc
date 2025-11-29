const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { verifyToken, isAuthority } = require('../middleware/auth.middleware');

// GET /api/stats - Obtener estadísticas generales
router.get('/', async (req, res) => {
  try {
    // Total de reportes
    const reportsResult = await query('SELECT COUNT(*) as total FROM reports');
    
    // Reportes por estado
    const reportsByStatusResult = await query(
      `SELECT status, COUNT(*) as count FROM reports GROUP BY status`
    );

    // Reportes por tipo
    const reportsByTypeResult = await query(
      `SELECT incident_type, COUNT(*) as count FROM reports 
       GROUP BY incident_type ORDER BY count DESC LIMIT 10`
    );

    // Reportes últimas 24 horas
    const reportsLast24hResult = await query(
      `SELECT COUNT(*) as total FROM reports 
       WHERE created_at >= NOW() - INTERVAL '24 hours'`
    );

    // Zonas de alto riesgo
    const highRiskZonesResult = await query(
      `SELECT COUNT(*) as total FROM heat_zones WHERE intensity >= 7`
    );

    // Alertas activas
    const activeAlertsResult = await query(
      `SELECT COUNT(*) as total FROM alerts 
       WHERE is_active = true AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`
    );

    // Total de usuarios
    const usersResult = await query('SELECT COUNT(*) as total FROM users WHERE is_active = true');

    // Puntos de ayuda
    const helpPointsResult = await query('SELECT COUNT(*) as total FROM help_points WHERE is_active = true');

    res.json({
      success: true,
      data: {
        reports: {
          total: parseInt(reportsResult.rows[0].total),
          last24h: parseInt(reportsLast24hResult.rows[0].total),
          byStatus: reportsByStatusResult.rows.reduce((acc, row) => {
            acc[row.status] = parseInt(row.count);
            return acc;
          }, {}),
          byType: reportsByTypeResult.rows.map(r => ({
            type: r.incident_type,
            count: parseInt(r.count)
          }))
        },
        zones: {
          highRisk: parseInt(highRiskZonesResult.rows[0].total)
        },
        alerts: {
          active: parseInt(activeAlertsResult.rows[0].total)
        },
        users: {
          total: parseInt(usersResult.rows[0].total)
        },
        helpPoints: {
          total: parseInt(helpPointsResult.rows[0].total)
        }
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas'
    });
  }
});

// GET /api/stats/dashboard - Estadísticas para dashboard (autoridades)
router.get('/dashboard', verifyToken, isAuthority, async (req, res) => {
  try {
    // Reportes pendientes
    const pendingReportsResult = await query(
      `SELECT COUNT(*) as total FROM reports WHERE status IN ('pending', 'reviewing')`
    );

    // Reportes por día (últimos 7 días)
    const reportsByDayResult = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count 
       FROM reports 
       WHERE created_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at)
       ORDER BY date`
    );

    // Top zonas peligrosas
    const topDangerZonesResult = await query(
      `SELECT latitude, longitude, intensity, zone_type, incident_count
       FROM heat_zones
       ORDER BY intensity DESC, incident_count DESC
       LIMIT 5`
    );

    // Alertas críticas activas
    const criticalAlertsResult = await query(
      `SELECT uuid, title, alert_type, created_at
       FROM alerts
       WHERE is_active = true 
       AND severity IN ('critical', 'high')
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       ORDER BY created_at DESC
       LIMIT 5`
    );

    // Reportes recientes
    const recentReportsResult = await query(
      `SELECT r.uuid, r.incident_type, r.severity, r.status, r.address, r.created_at,
              CASE WHEN r.is_anonymous THEN NULL ELSE u.full_name END as reporter_name
       FROM reports r
       LEFT JOIN users u ON r.user_id = u.id
       ORDER BY r.created_at DESC
       LIMIT 10`
    );

    res.json({
      success: true,
      data: {
        pendingReports: parseInt(pendingReportsResult.rows[0].total),
        reportsByDay: reportsByDayResult.rows.map(r => ({
          date: r.date,
          count: parseInt(r.count)
        })),
        topDangerZones: topDangerZonesResult.rows.map(z => ({
          latitude: parseFloat(z.latitude),
          longitude: parseFloat(z.longitude),
          intensity: z.intensity,
          type: z.zone_type,
          incidentCount: z.incident_count
        })),
        criticalAlerts: criticalAlertsResult.rows,
        recentReports: recentReportsResult.rows.map(r => ({
          uuid: r.uuid,
          incidentType: r.incident_type,
          severity: r.severity,
          status: r.status,
          address: r.address,
          reporterName: r.reporter_name,
          createdAt: r.created_at
        }))
      }
    });
  } catch (error) {
    console.error('Error al obtener dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener dashboard'
    });
  }
});

// GET /api/stats/reports-trend - Tendencia de reportes
router.get('/reports-trend', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const result = await query(
      `SELECT DATE(created_at) as date, 
              incident_type,
              COUNT(*) as count 
       FROM reports 
       WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
       GROUP BY DATE(created_at), incident_type
       ORDER BY date`
    );

    // Agrupar por fecha
    const trendData = {};
    result.rows.forEach(row => {
      if (!trendData[row.date]) {
        trendData[row.date] = { date: row.date, total: 0, byType: {} };
      }
      trendData[row.date].total += parseInt(row.count);
      trendData[row.date].byType[row.incident_type] = parseInt(row.count);
    });

    res.json({
      success: true,
      data: {
        trend: Object.values(trendData)
      }
    });
  } catch (error) {
    console.error('Error al obtener tendencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener tendencia'
    });
  }
});

// GET /api/stats/safety-score - Score de seguridad por zona
router.get('/safety-score', async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Se requieren latitud y longitud'
      });
    }

    // Obtener zonas de calor cercanas
    const zonesResult = await query(
      `SELECT zone_type, intensity, incident_count FROM heat_zones
       WHERE (
         6371 * acos(
           cos(radians($1)) * cos(radians(latitude)) * 
           cos(radians(longitude) - radians($2)) + 
           sin(radians($1)) * sin(radians(latitude))
         )
       ) <= $3`,
      [parseFloat(lat), parseFloat(lng), parseFloat(radius)]
    );

    // Calcular score (100 = muy seguro, 0 = muy peligroso)
    let safetyScore = 100;
    let crimeZones = 0;
    let accidentZones = 0;

    zonesResult.rows.forEach(zone => {
      safetyScore -= zone.intensity * 2;
      if (zone.zone_type === 'crime') crimeZones++;
      if (zone.zone_type === 'accident') accidentZones++;
    });

    safetyScore = Math.max(0, Math.min(100, safetyScore));

    // Obtener puntos de ayuda cercanos
    const helpPointsResult = await query(
      `SELECT COUNT(*) as total FROM help_points
       WHERE is_active = true AND (
         6371 * acos(
           cos(radians($1)) * cos(radians(latitude)) * 
           cos(radians(longitude) - radians($2)) + 
           sin(radians($1)) * sin(radians(latitude))
         )
       ) <= $3`,
      [parseFloat(lat), parseFloat(lng), parseFloat(radius)]
    );

    res.json({
      success: true,
      data: {
        safetyScore,
        safetyLevel: safetyScore >= 80 ? 'high' : safetyScore >= 50 ? 'medium' : 'low',
        details: {
          dangerZones: zonesResult.rows.length,
          crimeZones,
          accidentZones,
          helpPointsNearby: parseInt(helpPointsResult.rows[0].total)
        },
        recommendation: safetyScore < 50 
          ? 'Se recomienda precaución en esta zona' 
          : safetyScore < 80 
            ? 'Zona moderadamente segura' 
            : 'Zona segura'
      }
    });
  } catch (error) {
    console.error('Error al calcular safety score:', error);
    res.status(500).json({
      success: false,
      message: 'Error al calcular safety score'
    });
  }
});

module.exports = router;
