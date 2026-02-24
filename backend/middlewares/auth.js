const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware pour protéger les routes
exports.protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        // Obtenir le token du header
        token = req.headers.authorization.split(' ')[1];
    }

    // Vérifier si le token existe
    if (!token) {
        return res.status(401).json({ success: false, error: 'Accès non autorisé à cette route' });
    }

    try {
        // Vérifier le token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = await User.findById(decoded.id);

        next();
    } catch (err) {
        console.error(err);
        return res.status(401).json({ success: false, error: 'Accès non autorisé à cette route' });
    }
};

// Middleware pour autoriser certains rôles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: `Le rôle utilisateur ${req.user.role} n'est pas autorisé à accéder à cette route`
            });
        }
        next();
    };
};
