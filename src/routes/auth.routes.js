const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');

// Validaciones para registro
const registerValidation = [
  body('fullName').trim().notEmpty().withMessage('Nombre completo requerido'),
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
];

// Validaciones para login
const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Contraseña requerida')
];

// POST /api/auth/register - Registro de usuarios
router.post('/register', registerValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { fullName, email, password, phone, userType = 'citizen' } = req.body;

    // Verificar si el email ya existe
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El email ya está registrado'
      });
    }

    // Encriptar contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Crear usuario
    const userUuid = uuidv4();
    const result = await query(
      `INSERT INTO users (uuid, full_name, email, password, phone, user_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, uuid, full_name, email, user_type, created_at`,
      [userUuid, fullName, email, hashedPassword, phone || null, userType]
    );

    const user = result.rows[0];

    // Generar token
    const token = jwt.sign(
      { uuid: user.uuid, email: user.email, userType: user.user_type },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        user: {
          uuid: user.uuid,
          fullName: user.full_name,
          email: user.email,
          userType: user.user_type
        },
        token
      }
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar usuario'
    });
  }
});

// POST /api/auth/register-authority - Registro de autoridades
router.post('/register-authority', [
  ...registerValidation,
  body('institution').trim().notEmpty().withMessage('Institución requerida'),
  body('badgeNumber').trim().notEmpty().withMessage('Número de placa/credencial requerido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { fullName, email, password, phone, institution, badgeNumber } = req.body;

    // Verificar si el email ya existe
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El email ya está registrado'
      });
    }

    // Encriptar contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Crear usuario autoridad
    const userUuid = uuidv4();
    const result = await query(
      `INSERT INTO users (uuid, full_name, email, password, phone, user_type, institution, badge_number, is_verified)
       VALUES ($1, $2, $3, $4, $5, 'authority', $6, $7, false)
       RETURNING id, uuid, full_name, email, user_type, institution, is_verified, created_at`,
      [userUuid, fullName, email, hashedPassword, phone || null, institution, badgeNumber]
    );

    const user = result.rows[0];

    // Generar token
    const token = jwt.sign(
      { uuid: user.uuid, email: user.email, userType: user.user_type },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Autoridad registrada exitosamente. Pendiente de verificación.',
      data: {
        user: {
          uuid: user.uuid,
          fullName: user.full_name,
          email: user.email,
          userType: user.user_type,
          institution: user.institution,
          isVerified: user.is_verified
        },
        token
      }
    });
  } catch (error) {
    console.error('Error en registro de autoridad:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar autoridad'
    });
  }
});

// POST /api/auth/login - Inicio de sesión
router.post('/login', loginValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Buscar usuario
    const result = await query(
      `SELECT id, uuid, full_name, email, password, user_type, institution, 
              is_verified, is_active, avatar_url
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    const user = result.rows[0];

    // Verificar si la cuenta está activa
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Cuenta desactivada'
      });
    }

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Generar token
    const token = jwt.sign(
      { uuid: user.uuid, email: user.email, userType: user.user_type },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    res.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      data: {
        user: {
          uuid: user.uuid,
          fullName: user.full_name,
          email: user.email,
          userType: user.user_type,
          institution: user.institution,
          isVerified: user.is_verified,
          avatarUrl: user.avatar_url
        },
        token
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error al iniciar sesión'
    });
  }
});

// POST /api/auth/forgot-password - Solicitar recuperación de contraseña
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email } = req.body;

    // Verificar si el email existe
    const result = await query('SELECT id, uuid FROM users WHERE email = $1', [email]);
    
    // Por seguridad, siempre respondemos lo mismo
    res.json({
      success: true,
      message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña'
    });

    // TODO: Implementar envío de email de recuperación
  } catch (error) {
    console.error('Error en forgot-password:', error);
    res.status(500).json({
      success: false,
      message: 'Error al procesar solicitud'
    });
  }
});

module.exports = router;
