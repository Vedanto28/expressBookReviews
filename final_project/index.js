const express = require('express');
const jwt = require('jsonwebtoken');
const session = require('express-session')
const customer_routes = require('./router/auth_users.js').authenticated;
const {jwtSecret, isValid} = require('./router/auth_users.js');
const genl_routes = require('./router/general.js').general;

const app = express();

app.use(express.json());

app.use("/customer", session({
  secret: process.env.SESSION_SECRET || jwtSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 1000}
}));

app.use("/customer/auth/*", function auth(req,res,next){
  const token = req.session.authorization && req.session.authorization.accessToken;
  if (!token) {
    return res.status(401).json({message: "Authentication required"});
  }
  try {
    const identity = jwt.verify(token, jwtSecret, {algorithms: ['HS256']});
    if (typeof identity.username !== 'string' || !isValid(identity.username)) {
      return res.status(403).json({message: "Invalid authenticated identity"});
    }
    req.authenticatedUsername = identity.username;
    return next();
  } catch (error) {
    const expired = error.name === 'TokenExpiredError';
    return res.status(expired ? 401 : 403).json({
      message: expired ? "Authentication expired" : "Invalid authentication"
    });
  }
});
 
const PORT =5000;

app.use("/customer", customer_routes);
app.use("/", genl_routes);

app.listen(PORT,()=>console.log("Server is running"));
