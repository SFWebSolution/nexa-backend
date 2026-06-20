
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

// temporary test route
app.get("/", (req, res) => {
  res.send("Nexa backend is running 🚀");
});

app.listen(3000, () => {
  console.log("Server running");
});
