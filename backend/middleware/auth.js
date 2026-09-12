import jwt from 'jsonwebtoken';

/**
 * Express middleware that validates a Bearer JWT from the Authorization header.
 * On success, attaches the decoded payload to req.user and calls next().
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
}

/**
 * Express middleware factory that restricts access to the given roles.
 * Must be used after authenticate() — relies on req.user being set.
 * @param  {...string} roles - Allowed roles (e.g. 'admin', 'instructor')
 * @returns {import('express').RequestHandler}
 */
export function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions' });
        }
        next();
    };
}

/**
 * Creates a signed JWT containing the user's id, role, and email.
 * @param {object} user - User row from the database
 * @param {number} user.id
 * @param {string} user.role
 * @param {string} user.email
 * @returns {string} Signed JWT string
 */
export function generateToken(user) {
    return jwt.sign(
        { userId: user.id, role: user.role, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
}
