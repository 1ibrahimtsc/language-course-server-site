const express = require("express");
const cors = require("cors");

// middleware
app.use(cors());

const app = express();
const port = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("Summer Camp School is running");
});

app.listen(port, () => {
  console.log(`Summer Camp School is running on port ${port}`);
});
