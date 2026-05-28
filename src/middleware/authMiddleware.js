const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  // 1) Try to read token from cookie named 'token'
  const tokenFromCookie = req.cookies && req.cookies.token ? req.cookies.token : null;

  // 2) Try to read token from Authorization header: 'Bearer <token>'
  let tokenFromHeader = null;
  if (req.headers && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      tokenFromHeader = authHeader.slice(7); // remove 'Bearer '
    }
  }

  // 3) Use cookie token first, otherwise header token
  const token = tokenFromCookie || tokenFromHeader;
  if (!token) {
    // No token provided by the client
    return res.status(401).json({ message: 'Authentication required.' });
  }

  // 4) Make sure the server has a secret configured
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('Auth middleware: JWT_SECRET is not set in environment');
    return res.status(500).json({ message: 'Server not configured for authentication.' });
  }

  // 5) Verify the token and extract the payload
  try {
    const payload = jwt.verify(token, secret);
    // We expect the token payload to contain userId (set on login/signup)
    req.user = { id: payload.userId };
    return next();
  } catch (err) {
    console.error('Auth middleware: token verify failed -', err && err.message);
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

module.exports = authMiddleware;
