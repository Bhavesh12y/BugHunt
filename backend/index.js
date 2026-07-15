const express = require('express');
const cors = require('cors');
const qaRoutes = require('./routes/qaRoutes');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api', qaRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});