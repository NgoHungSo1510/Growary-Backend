const mongoose = require('mongoose');

const uri = 'mongodb+srv://hungso:Ostro%401357.vku@cluster0.mfxds.mongodb.net/growary?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(uri)
  .then(() => {
    console.log('✅ Successfully connected to MongoDB Atlas!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
  });
