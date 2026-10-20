const express = require('express');
const jwt = require('jsonwebtoken');
const {randomBytes, scryptSync, timingSafeEqual} = require('crypto');
let books = require("./booksdb.js");
const regd_users = express.Router();

let users = [];

// A random local fallback keeps secrets out of source control.
const jwtSecret = process.env.JWT_SECRET || randomBytes(32).toString('hex');

const isValid = (username) => users.some(user => user.username === username);

const authenticatedUser = (username, password) => {
  const user = users.find(user => user.username === username);
  if (!user || typeof password !== 'string') {
    return false;
  }
  const candidateHash = scryptSync(password, user.salt, 64);
  return timingSafeEqual(candidateHash, Buffer.from(user.passwordHash, 'hex'));
};

//only registered users can login
regd_users.post("/login", (req,res,next) => {
  const {username, password} = req.body || {};
  const normalizedUsername = typeof username === 'string' ? username.trim() : '';
  if (!normalizedUsername || typeof password !== 'string' || !password.trim() ||
      !authenticatedUser(normalizedUsername, password)) {
    return res.status(401).json({message: "Invalid username or password"});
  }
  // Rotate the session ID after login to prevent session fixation.
  req.session.regenerate(error => {
    if (error) return next(error);
    req.session.authorization = {
      accessToken: jwt.sign({username: normalizedUsername}, jwtSecret, {
        algorithm: 'HS256', expiresIn: '1h'
      })
    };
    req.session.save(error => {
      if (error) return next(error);
      return res.status(200).json({message: "Login successful"});
    });
  });
});

// Add a book review
regd_users.put("/auth/review/:isbn", (req, res) => {
  const isbn = req.params.isbn;
  if (!Object.prototype.hasOwnProperty.call(books, isbn) || !books[isbn]) {
    return res.status(404).json({message: "Book not found"});
  }
  const review = req.query.review;
  if (typeof review !== 'string' || !review.trim()) {
    return res.status(400).json({message: "A non-empty review is required"});
  }
  // Define an own property even for usernames such as "__proto__".
  Object.defineProperty(books[isbn].reviews, req.authenticatedUsername, {
    value: review, enumerable: true, configurable: true, writable: true
  });
  return res.status(200).json({message: "Review saved", reviews: books[isbn].reviews});
});

regd_users.delete("/auth/review/:isbn", (req, res) => {
  const isbn = req.params.isbn;
  if (!Object.prototype.hasOwnProperty.call(books, isbn) || !books[isbn]) {
    return res.status(404).json({message: "Book not found"});
  }
  const reviews = books[isbn].reviews;
  if (!Object.prototype.hasOwnProperty.call(reviews, req.authenticatedUsername)) {
    return res.status(404).json({message: "Review not found for this user"});
  }
  delete reviews[req.authenticatedUsername];
  return res.status(200).json({message: "Review deleted", reviews});
});

module.exports.authenticated = regd_users;
module.exports.isValid = isValid;
module.exports.users = users;
module.exports.jwtSecret = jwtSecret;
