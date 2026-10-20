const express = require('express');
const {randomBytes, scryptSync} = require('crypto');
let books = require("./booksdb.js");
let isValid = require("./auth_users.js").isValid;
let users = require("./auth_users.js").users;
const public_users = express.Router();


public_users.post("/register", (req,res) => {
  const {username, password} = req.body || {};
  if (typeof username !== 'string' || !username.trim() ||
      typeof password !== 'string' || !password.trim()) {
    return res.status(400).json({message: "Username and password are required"});
  }
  const normalizedUsername = username.trim();
  if (isValid(normalizedUsername)) {
    return res.status(409).json({message: "Username already exists"});
  }
  const salt = randomBytes(16).toString('hex');
  const passwordHash = scryptSync(password, salt, 64).toString('hex');
  users.push({username: normalizedUsername, salt, passwordHash});
  return res.status(201).json({message: "Registration successful"});
});

// Get the book list available in the shop
public_users.get('/',function (req, res) {
  return res.status(200).json(books);
});

// Get book details based on ISBN
public_users.get('/isbn/:isbn',function (req, res) {
  const isbn = req.params.isbn;
  if (!Object.prototype.hasOwnProperty.call(books, isbn) || !books[isbn]) {
    return res.status(404).json({message: "Book not found"});
  }
  return res.status(200).json(books[isbn]);
 });
  
// Get book details based on author
public_users.get('/author/:author',function (req, res) {
  const author = req.params.author.toLowerCase();
  const matches = Object.fromEntries(Object.entries(books).filter(([, book]) =>
    book && typeof book.author === 'string' && book.author.toLowerCase() === author
  ));
  if (Object.keys(matches).length === 0) {
    return res.status(404).json({message: "No books found for this author"});
  }
  return res.status(200).json(matches);
});

// Get all books based on title
public_users.get('/title/:title',function (req, res) {
  const title = req.params.title.toLowerCase();
  const matches = Object.fromEntries(Object.entries(books).filter(([, book]) =>
    book && typeof book.title === 'string' && book.title.toLowerCase() === title
  ));
  if (Object.keys(matches).length === 0) {
    return res.status(404).json({message: "No books found for this title"});
  }
  return res.status(200).json(matches);
});

//  Get book review
public_users.get('/review/:isbn',function (req, res) {
  const isbn = req.params.isbn;
  if (!Object.prototype.hasOwnProperty.call(books, isbn) || !books[isbn]) {
    return res.status(404).json({message: "Book not found"});
  }
  return res.status(200).json(books[isbn].reviews || {});
});

module.exports.general = public_users;
