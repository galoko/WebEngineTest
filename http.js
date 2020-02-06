const express = require("express");
const path = require("path");
const http = require('http');
const browserify = require('browserify-middleware');

const app = express();

app.use(express.static(path.join(__dirname, "build")));
app.use(express.urlencoded({
    extended: true
}));
app.use(express.json());

app.get("/", function(req, res, next) {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/main.js", browserify(path.join(__dirname, "main.js")));

const port = 3000;
app.set('port', port);
http.createServer(app).listen(port);